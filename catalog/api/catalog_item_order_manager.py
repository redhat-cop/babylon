"""Manager resolution and approval authority for CatalogItemOrders (GPTEINFRA-18189).

Manager data comes from Reporting API `GET /users/by-email/{email}`. The
response contract (Reporting API v1.10.3, see
fixtures/reporting_api/users_by_email_contract.json):

- `manager`: the direct manager as a full User object, or null. The declared
  default is `[]`, which is treated as no manager.
- `manager_levels`: UserManagerLevel records. Each describes one user
  (`user_email`, `employee_number`, `active`) and that user's management chain
  in flat `level_1_email` ... `level_14_email` fields.

Authority is set membership: the direct manager's email, or any
`level_N_email` in the requester's single active record. The schema does not
define whether level 1 is the top or the nearest level, so no decision here
depends on level order or on the number of levels. Ambiguous or malformed
data never grants authority.
"""

import asyncio
import re
from dataclasses import dataclass, field

import aiohttp

from catalog_item_order import reporting_user_lookup_path

MAX_MANAGER_LEVEL = 14
_LEVEL_EMAIL_RE = re.compile(r'^level_(\d+)_email$')

BASIS_ADMINISTRATOR = 'administrator'
BASIS_DIRECT_MANAGER = 'direct_manager'
BASIS_MANAGEMENT_CHAIN = 'management_chain'
AUTHORITY_BASES = (BASIS_ADMINISTRATOR, BASIS_DIRECT_MANAGER, BASIS_MANAGEMENT_CHAIN)

LOOKUP_NOT_FOUND = 'RequesterNotFound'
LOOKUP_UNAVAILABLE = 'ManagerLookupUnavailable'
LOOKUP_INVALID = 'InvalidManagerData'


class ManagerLookupError(Exception):
    """reason is one of LOOKUP_NOT_FOUND, LOOKUP_UNAVAILABLE, LOOKUP_INVALID."""

    def __init__(self, reason, message):
        super().__init__(message)
        self.reason = reason
        self.message = message


def normalize_email(value):
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    return value if '@' in value and len(value) <= 320 else None


def trusted_user_email(user_name):
    """Email for an OpenShift user, only when the user name is an address.

    Never constructed from other names or taken from client input."""
    return normalize_email(user_name)


@dataclass(frozen=True)
class ManagerData:
    requester_email: str
    direct_manager_email: str | None = None
    direct_manager_name: str | None = None
    # Management chain emails mapped to the level field they appeared in.
    chain: dict = field(default_factory=dict)
    chain_available: bool = False

    def authority_for(self, email):
        """Return (basis, level) for email, or None if not an eligible approver."""
        email = normalize_email(email)
        if email is None or email == self.requester_email:
            return None
        if email == self.direct_manager_email:
            return BASIS_DIRECT_MANAGER, None
        if email in self.chain:
            return BASIS_MANAGEMENT_CHAIN, self.chain[email]
        return None


def parse_manager_data(requester_email, user):
    """Normalize a Reporting API User response. Raises ManagerLookupError(INVALID)."""
    requester_email = normalize_email(requester_email)
    if requester_email is None:
        raise ManagerLookupError(LOOKUP_INVALID, 'Requester email is not valid')
    if not isinstance(user, dict):
        raise ManagerLookupError(LOOKUP_INVALID, 'Reporting API user response is not an object')
    if normalize_email(user.get('email')) != requester_email:
        raise ManagerLookupError(LOOKUP_INVALID, 'Reporting API returned a different user')

    manager = user.get('manager')
    direct_email = direct_name = None
    if isinstance(manager, dict):
        direct_email = normalize_email(manager.get('email'))
        if direct_email is None:
            raise ManagerLookupError(LOOKUP_INVALID, 'Direct manager has no valid email')
        if direct_email == requester_email:
            direct_email = None
        else:
            name = manager.get('full_name')
            direct_name = name if isinstance(name, str) and name.strip() else None
    elif manager not in (None, []):
        raise ManagerLookupError(LOOKUP_INVALID, 'Reporting API manager field has an unexpected type')

    levels = user.get('manager_levels')
    if levels is None:
        levels = []
    if not isinstance(levels, list):
        raise ManagerLookupError(LOOKUP_INVALID, 'Reporting API manager_levels is not a list')
    active = [
        record for record in levels
        if isinstance(record, dict)
        and record.get('active') is True
        and normalize_email(record.get('user_email')) == requester_email
    ]
    chain = {}
    chain_available = len(active) == 1
    if chain_available:
        for key, value in active[0].items():
            match = _LEVEL_EMAIL_RE.match(key)
            if not match or not 1 <= int(match.group(1)) <= MAX_MANAGER_LEVEL:
                continue
            email = normalize_email(value)
            if email and email != requester_email:
                chain.setdefault(email, int(match.group(1)))
    return ManagerData(
        requester_email=requester_email,
        direct_manager_email=direct_email,
        direct_manager_name=direct_name,
        chain=chain,
        chain_available=chain_available,
    )


class ReportingApiClient:
    """Reporting API user lookups with a bounded timeout and retries."""

    def __init__(self, base_url, token, timeout=10, retries=2, retry_delay=1, session_factory=None):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.timeout = timeout
        self.retries = retries
        self.retry_delay = retry_delay
        self.session_factory = session_factory or aiohttp.ClientSession

    async def _get_user(self, email):
        headers = {'Authorization': f"Bearer {self.token}"} if self.token else {}
        url = self.base_url + reporting_user_lookup_path(email)
        async with self.session_factory(timeout=aiohttp.ClientTimeout(total=self.timeout)) as session:
            async with session.get(url, headers=headers, allow_redirects=False) as response:
                if response.status == 404:
                    raise ManagerLookupError(LOOKUP_NOT_FOUND, 'Requester is not known to the Reporting API')
                if response.status != 200:
                    raise ManagerLookupError(
                        LOOKUP_UNAVAILABLE, f"Reporting API returned HTTP {response.status}"
                    )
                try:
                    return await response.json(content_type=None)
                except ValueError as exception:
                    raise ManagerLookupError(LOOKUP_INVALID, 'Reporting API returned invalid JSON') from exception

    async def get_manager_data(self, requester_email):
        """Return ManagerData for requester_email or raise ManagerLookupError."""
        email = normalize_email(requester_email)
        if email is None:
            raise ManagerLookupError(LOOKUP_INVALID, 'Requester email is not valid')
        for attempt in range(self.retries + 1):
            try:
                return parse_manager_data(email, await self._get_user(email))
            except ManagerLookupError as exception:
                if exception.reason != LOOKUP_UNAVAILABLE or attempt == self.retries:
                    raise
            except (aiohttp.ClientError, asyncio.TimeoutError) as exception:
                if attempt == self.retries:
                    raise ManagerLookupError(LOOKUP_UNAVAILABLE, 'Reporting API is unavailable') from exception
            await asyncio.sleep(self.retry_delay)
        raise ManagerLookupError(LOOKUP_UNAVAILABLE, 'Reporting API is unavailable')
