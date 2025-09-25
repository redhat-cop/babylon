import json
import os
import re
import traceback

from base64 import b64decode
from copy import deepcopy
from datetime import datetime, timezone

import aiofiles
import aiofiles.os
import aiohttp
import aioshutil
import asyncio
import functools
import pygit2
import kopf
import kubernetes_asyncio
import pytimeparse

from babylon import Babylon
from agnosticvcomponent import AgnosticVComponent
from cachedkopfobject import CachedKopfObject

# Add aiofiles wrapping for chmod
aiofiles.os.chmod = aiofiles.os.wrap(os.chmod)

app_root = os.environ.get('APP_ROOT', '/opt/app-root')
agnosticv_cli_path = os.environ.get('AGNOSTICV_CLI_PATH', f"{app_root}/bin/agnosticv")

def path_to_name(path):
    name = re.sub(r'\.(json|yaml|yml)$', '', path.lower().replace('_', '-').replace('/', '.'))
    
    # Kubernetes resource names must be <= 63 characters
    if len(name) > 63:
        raise AgnosticVComponentValidationError(
            f"Component name '{name}' ({len(name)} characters) exceeds Kubernetes 63-character limit. "
            f"Please shorten the path '{path}' to create a valid component name."
        )
    
    return name

class AgnosticVProcessingError(Exception):
    pass

class AgnosticVComponentValidationError(AgnosticVProcessingError):
    pass

class AgnosticVConflictError(AgnosticVProcessingError):
    pass

class AgnosticVExecError(AgnosticVProcessingError):
    pass

class AgnosticVRepo(CachedKopfObject):
    api_group = Babylon.agnosticv_api_group
    api_version = f"{Babylon.agnosticv_api_group}/{Babylon.agnosticv_version}"
    kind = 'AgnosticVRepo'
    plural = 'agnosticvrepos'
    version = Babylon.agnosticv_version

    git_base_path = f"{app_root}/git"
    cache = {}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.git_hexsha = self.git_checkout_ref = self.git_repo = None
        self.git_changed_files = []
        self.git_deleted_files = set()
        self.fetched_branches = set()  # Track which branches we've fetched fully
        self.last_pr_commits = {}  # Track last known commit for each PR branch
        self.last_cleanup_time = None  # Timestamp of last repository cleanup
        self.cleanup_interval = 3600  # Run git cleanup every hour (in seconds)
        self.max_tracked_pr_commits = 1000  # Maximum number of PR commits to track
        self.max_fetched_branches = 500  # Maximum number of fetched branches to track
        
        # GitHub API rate limiting
        self.github_api_rate_limited_until = None  # Timestamp when rate limit will reset
        self.github_api_backoff_delay = 60  # Start with 1 minute backoff
        self.github_api_max_backoff = 3600  # Maximum 1 hour backoff
        self.github_api_success_count = 0  # Track successful calls to reduce backoff

    @property
    def agnosticv_path(self):
        if 'contextDir' in self.spec:
            return os.path.join(self.git_repo_path, self.spec['contextDir'])
        return self.git_repo_path

    @property
    def anarchy_collections(self):
        return self.spec.get('babylonAnarchyCollections')

    @property
    def anarchy_roles(self):
        return self.spec.get('babylonAnarchyRoles', [{
            "name": "babylon_anarchy_governor",
            "src": "https://github.com/rhpds/babylon_anarchy_governor.git",
            "version": "main"
        }])

    @property
    def catalog_url(self):
        return self.spec.get('catalogUrl')

    @property
    def context_dir(self):
        return self.spec.get('contextDir')

    @property
    def default_execution_environment(self):
        return self.spec.get('default_execution_environment')

    @property
    def execution_environment_allow_list(self):
        return (
            Babylon.execution_environment_allow_list +
            self.spec.get('execution_environment_allow_list_extra', [])
        )

    @property
    def git_env(self):
        env = {}
        if self.ssh_key_secret_name:
            # FIXME - known_hosts should be configurable
            env['GIT_SSH_COMMAND'] = (
                f"ssh -i {self.git_ssh_key_path} "
                f"-o UserKnownHostsFile={app_root}/.ssh/known_hosts"
            )
        return env

    @property
    def git_ref(self):
        return self.spec.get('ref')

    @property
    def github_api_base_url(self):
        if self.git_url.startswith('git@github.com:'):
            if self.git_url.endswith('.git'):
                return f"https://api.github.com/repos/{self.git_url[15:-4]}"
            else:
                return f"https://api.github.com/repos/{self.git_url[15:]}"
        else:
            raise kopf.TemporaryError(f"Unable to determine GitHub base url!", delay=600)

    @property
    def github_preload_pull_requests(self):
        return 'preloadPullRequests' in self.spec.get('gitHub', {})

    @property
    def github_preload_pull_requests_mode(self):
        return self.spec.get('gitHub', {}).get('preloadPullRequests', {}).get('mode')

    @property
    def github_token_secret_name(self):
        return self.spec.get('gitHub', {}).get('tokenSecret')

    @property
    def git_repo_path(self):
        return os.path.join(self.git_base_path, self.name)

    @property
    def git_ssh_key_path(self):
        if self.ssh_key_secret_name:
            return os.path.join(self.git_base_path, self.name + '.sshkey')

    @property
    def git_url(self):
        return self.spec['url']

    @property
    def last_successful_git_hexsha(self):
        return self.status.get('git', {}).get('commit')

    @property
    def polling_interval(self):
        return pytimeparse.parse(
            self.spec.get('pollingInterval', Babylon.default_polling_interval)
        )

    @property
    def ssh_key_secret_name(self):
        return self.spec.get('sshKey')
    
    def needs_full_fetch(self, ref):
        """Check if we need to fetch full history for a branch"""
        return ref not in self.fetched_branches
    
    def mark_branch_fetched(self, ref):
        """Mark a branch as having full history fetched"""
        self.fetched_branches.add(ref)
    
    def is_github_api_rate_limited(self):
        """Check if we should skip GitHub API calls due to rate limiting"""
        if not self.github_api_rate_limited_until:
            return False
        
        now = datetime.now(timezone.utc).timestamp()
        if now >= self.github_api_rate_limited_until:
            # Rate limit period has passed
            self.github_api_rate_limited_until = None
            return False
        
        return True
    
    def handle_github_api_rate_limit(self, logger):
        """Handle GitHub API rate limiting with exponential backoff"""
        now = datetime.now(timezone.utc).timestamp()
        
        # Set rate limited until timestamp
        self.github_api_rate_limited_until = now + self.github_api_backoff_delay
        
        logger.warning(f"GitHub API rate limited. Backing off for {self.github_api_backoff_delay} seconds (until {datetime.fromtimestamp(self.github_api_rate_limited_until, timezone.utc)})")
        
        # Exponential backoff (double the delay, up to max)
        self.github_api_backoff_delay = min(self.github_api_backoff_delay * 2, self.github_api_max_backoff)
        self.github_api_success_count = 0
    
    def handle_github_api_success(self):
        """Handle successful GitHub API call - reduce backoff if we've had multiple successes"""
        self.github_api_success_count += 1
        
        # After 5 successful calls, reduce backoff delay
        if self.github_api_success_count >= 5:
            self.github_api_backoff_delay = max(60, self.github_api_backoff_delay // 2)
            self.github_api_success_count = 0
    
    def has_local_ref_changed(self, ref):
        """Check if local ref differs from remote ref"""
        try:
            local_ref_name = f'refs/remotes/origin/{ref}'
            if local_ref_name not in self.git_repo.references:
                return True  # Branch doesn't exist locally, needs fetch
            
            # For a more thorough check, we could compare with remote
            # For now, we'll rely on the fetched_branches tracking
            return False
        except (pygit2.GitError, KeyError):
            return True  # If we can't check, assume it needs fetch

    def __git_changed_files_in_branch(self, logger, ref=None):
        """
        Internal method to compute changed files between branches.
        This runs in a thread executor, so NO LOGGING should be done here.
        Return tuple of (files, error_message) instead.
        """
        try:
            origin_ref_name = f'refs/remotes/origin/{self.git_ref}'
            origin_other_name = f'refs/remotes/origin/{ref}'
            
            if origin_ref_name not in self.git_repo.references or origin_other_name not in self.git_repo.references:
                return [], f"References {origin_ref_name} or {origin_other_name} not found in repository"
                
            origin_ref_oid = self.git_repo.references[origin_ref_name].target
            origin_other_oid = self.git_repo.references[origin_other_name].target
            merge_base_oid = self.git_repo.merge_base(origin_ref_oid, origin_other_oid)
            
            # Check if merge_base returned None (no common ancestor)
            if merge_base_oid is None:
                return [], f"No common ancestor found between {origin_ref_name} and {origin_other_name}"
            
            # Get commit objects from OIDs for diff()
            # Use direct indexing for commit objects (pygit2 standard approach)
            try:
                merge_base_commit = self.git_repo[merge_base_oid]
                origin_other_commit = self.git_repo[origin_other_oid]
            except (KeyError, TypeError):
                # If we can't get the commit objects, return empty list
                return [], f"Unable to retrieve commit objects for OIDs {merge_base_oid} or {origin_other_oid}"
            
            # Ensure we have commit objects, not other git object types
            if merge_base_commit.type != pygit2.GIT_OBJECT_COMMIT or origin_other_commit.type != pygit2.GIT_OBJECT_COMMIT:
                return [], f"One of the OIDs {merge_base_oid} or {origin_other_oid} is not a commit"
            
            diff = self.git_repo.diff(merge_base_commit, origin_other_commit)
            
            return [delta.new_file.path if delta.new_file.path else delta.old_file.path for delta in diff.deltas], None
        except (pygit2.GitError, KeyError, ValueError, TypeError) as e:
            return [], f"Unable to compute changed files in branch {ref}: {e}"

    def __git_repo_checkout(self, logger, ref=None):
        if not ref:
            ref = self.git_ref

        try:
            # Try to checkout as a remote branch first
            remote_ref = f'refs/remotes/origin/{ref}'
            if remote_ref in self.git_repo.references:
                target_oid = self.git_repo.references[remote_ref].target
                commit = self.git_repo[target_oid]
                self.git_repo.checkout_tree(commit.tree)
                # Set HEAD to point to this commit (detached HEAD)
                self.git_repo.set_head(target_oid)
                self.git_hexsha = str(target_oid)
            # Try as direct commit hash
            elif re.match(r'[0-9a-f]+$', ref):
                try:
                    target_oid = pygit2.Oid(hex=ref)
                    commit = self.git_repo[target_oid]
                    self.git_repo.checkout_tree(commit.tree)
                    self.git_repo.set_head(target_oid)
                    self.git_hexsha = str(target_oid)
                except (pygit2.GitError, ValueError, KeyError):
                    raise kopf.TemporaryError(f"Unable to checkout commit {ref}", delay=60)
            else:
                raise kopf.TemporaryError(f"Unable to resolve reference {ref}", delay=60)
        except pygit2.GitError as e:
            raise kopf.TemporaryError(f"Git checkout failed: {e}", delay=60)

        self.git_checkout_ref = ref

    def __git_repo_clone(self, logger):
        # Create callbacks for authentication if SSH key is provided
        callbacks = None
        if self.ssh_key_secret_name and os.path.exists(self.git_ssh_key_path):
            def credentials_callback(url, username_from_url, allowed_types):
                if allowed_types & pygit2.GIT_CREDENTIAL_SSH_KEY:
                    return pygit2.Keypair(
                        username='git',
                        pubkey=f'{self.git_ssh_key_path}.pub',
                        privkey=self.git_ssh_key_path,
                        passphrase=''
                    )
                return None
            
            # For pygit2, we need to handle certificate checking differently
            def certificate_check_callback(cert, valid, host):
                # Accept all certificates for now (equivalent to original SSH settings)
                # TODO: Implement proper known_hosts checking
                return True
                
            callbacks = pygit2.RemoteCallbacks(
                credentials=credentials_callback,
                certificate_check=certificate_check_callback
            )
        
        try:
            # Clone with full history for optimal merge base calculations
            # This is a one-time cost that enables efficient incremental updates
            self.git_repo = pygit2.clone_repository(
                url=self.git_url,
                path=self.git_repo_path,
                callbacks=callbacks,
                bare=False,
                checkout_branch=self.git_ref
                # No depth limit - we want full history for efficient operations
            )
            self.__git_repo_checkout(logger=logger)
            self.mark_branch_fetched(self.git_ref)
            logger.info(f"Cloned {self.git_ref} [{self.git_hexsha}] with full history")
        except pygit2.GitError as e:
            raise kopf.TemporaryError(f"Git clone failed: {e}", delay=60)

    async def __has_remote_changes(self, logger):
        """Check if remote branch has new commits using GitHub API (lightweight pre-check)"""
        if not self.github_token_secret_name:
            logger.debug(f"No GitHub token for {self.name}, falling back to git fetch")
            return True  # Fall back to git fetch if no API access
        
        # Check if we're in rate limiting backoff period
        if self.is_github_api_rate_limited():
            logger.debug(f"GitHub API rate limited for {self.name}, falling back to git fetch")
            return True  # Fall back to git fetch during rate limit
        
        try:
            # Get current local commit
            if not self.git_repo:
                return True  # Need to fetch if no local repo
                
            local_ref_name = f'refs/remotes/origin/{self.git_ref}'
            if local_ref_name not in self.git_repo.references:
                return True  # Need to fetch if branch doesn't exist locally
                
            local_sha = str(self.git_repo.references[local_ref_name].target)
            
            # Check remote commit via GitHub API
            github_token = await self.get_github_token()
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.github_api_base_url}/branches/{self.git_ref}",
                    headers={
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + github_token,
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                    timeout=aiohttp.ClientTimeout(total=5)  # Quick timeout
                ) as response:
                    if response.status == 403:
                        # Rate limited - handle backoff
                        self.handle_github_api_rate_limit(logger)
                        return True  # Fall back to git fetch
                    elif response.status != 200:
                        logger.debug(f"GitHub API check failed with {response.status}, falling back to git fetch")
                        return True  # Fall back to git fetch on API errors
                    
                    # Successful API call
                    self.handle_github_api_success()
                    
                    branch_info = await response.json()
                    remote_sha = branch_info['commit']['sha']
                    
                    has_changes = remote_sha != local_sha
                    if has_changes:
                        logger.debug(f"GitHub API detected changes: {local_sha[:8]} -> {remote_sha[:8]}")
                    else:
                        logger.debug(f"GitHub API: no changes detected for {self.git_ref}")
                    
                    return has_changes
                    
        except Exception as e:
            logger.debug(f"GitHub API pre-check failed: {e}, falling back to git fetch")
            return True  # Fall back to git fetch on any errors

    def __git_repo_pull(self, logger):
        if not self.git_repo:
            self.git_repo = pygit2.Repository(self.git_repo_path)
            # Initialize git_hexsha from current HEAD if not set
            if not self.git_hexsha:
                try:
                    head = self.git_repo.head
                    self.git_hexsha = str(head.target)
                except pygit2.GitError:
                    # Repository might not have any commits yet
                    self.git_hexsha = None
            
        # Create callbacks for authentication if SSH key is provided
        callbacks = None
        if self.ssh_key_secret_name and os.path.exists(self.git_ssh_key_path):
            def credentials_callback(url, username_from_url, allowed_types):
                if allowed_types & pygit2.GIT_CREDENTIAL_SSH_KEY:
                    return pygit2.Keypair(
                        username='git',
                        pubkey=f'{self.git_ssh_key_path}.pub',
                        privkey=self.git_ssh_key_path,
                        passphrase=''
                    )
                return None
            
            # For pygit2, we need to handle certificate checking differently
            def certificate_check_callback(cert, valid, host):
                # Accept all certificates for now (equivalent to original SSH settings)
                # TODO: Implement proper known_hosts checking
                return True
                
            callbacks = pygit2.RemoteCallbacks(
                credentials=credentials_callback,
                certificate_check=certificate_check_callback
            )
        
        try:
            # Smart incremental fetch strategy
            remote = self.git_repo.remotes['origin']
            
            # Check if we need to fetch the main branch
            if self.needs_full_fetch(self.git_ref):
                # First time fetching this branch - get full history
                main_refspec = f'refs/heads/{self.git_ref}:refs/remotes/origin/{self.git_ref}'
                remote.fetch(
                    refspecs=[main_refspec],
                    callbacks=callbacks
                    # No depth limit for full history
                )
                self.mark_branch_fetched(self.git_ref)
                logger.info(f"Fetched full history for {self.git_ref}")
            else:
                # Incremental update - just get new commits
                main_refspec = f'refs/heads/{self.git_ref}:refs/remotes/origin/{self.git_ref}'
                remote.fetch(
                    refspecs=[main_refspec],
                    callbacks=callbacks
                    # No depth limit for incremental - git is smart about this
                )
                logger.debug(f"Incremental fetch for {self.git_ref}")
            
            # If GitHub preload PRs is enabled, handle PR branches intelligently
            if self.github_preload_pull_requests:
                try:
                    # For PR processing, we fetch all branches but git will only download
                    # what's actually new since we have full history
                    logger.debug("Fetching all branches for PR processing...")
                    remote.fetch(
                        refspecs=["+refs/heads/*:refs/remotes/origin/*"],
                        callbacks=callbacks
                        # No depth limit - git handles incremental efficiently with full history
                    )
                    logger.info(f"Fetched all refs (incremental update with full history cache)")
                except pygit2.GitError as e:
                    logger.warning(f"Failed to fetch all branches: {e}, falling back to individual fetches")
            
            prev_hexsha = self.git_hexsha
            self.__git_repo_checkout(logger=logger)

            self.git_changed_files.clear()
            self.git_deleted_files.clear()

            if prev_hexsha == self.git_hexsha:
                return

            logger.info(f"Checked out {self.git_ref} [{self.git_hexsha}]")

            if not self.last_successful_git_hexsha:
                return

            # Get diff between last successful commit and current
            try:
                old_oid = pygit2.Oid(hex=self.last_successful_git_hexsha)
                new_oid = pygit2.Oid(hex=self.git_hexsha)
                diff = self.git_repo.diff(old_oid, new_oid)
                
                for delta in diff.deltas:
                    if delta.status == pygit2.GIT_DELTA_DELETED:
                        self.git_deleted_files.add(delta.old_file.path)
                    else:
                        # Use new_file.path for added/modified, old_file.path for renamed
                        path = delta.new_file.path if delta.new_file.path else delta.old_file.path
                        self.git_changed_files.append(path)
            except (pygit2.GitError, ValueError) as e:
                logger.warning(f"Unable to compute diff: {e}")
                
        except pygit2.GitError as e:
            raise kopf.TemporaryError(f"Git fetch failed: {e}", delay=60)

    def validate_component_definition(self, definition, source):
        self.validate_execution_environment(
            source = source,
            value = definition['__meta__'].get('deployer', {}).get('execution_environment')
        )

    def validate_execution_environment(self, source, value):
        if not value:
            return
        if 'name' in value:
            if 'image' in value:
                raise AgnosticVComponentValidationError(
                    f"{source}: Execution environment cannot specify both name and image"
                )
            if 'pull' in value:
                raise AgnosticVComponentValidationError(
                    f"{source}: Execution environment cannot specify both name and pull"
                )
            for allow in self.execution_environment_allow_list:
                if 'name' in allow and re.search(allow['name'], value['name']):
                    return
            raise AgnosticVComponentValidationError(f"{source}: Execution environment name not allowed: {value['name']}")
        elif 'image' in value:
            for allow in self.execution_environment_allow_list:
                if 'image' in allow and re.search(allow['image'], value['image']):
                    return
            raise AgnosticVComponentValidationError(f"{source}: Execution environment image not allowed: {value['image']}")
        else:
            raise AgnosticVComponentValidationError(f"{source}: Execution environment requires name or image")

    async def agnosticv_exec(self, *cmd):
        proc = await asyncio.create_subprocess_exec(
            agnosticv_cli_path, *cmd,
            stdout = asyncio.subprocess.PIPE,
            stderr = asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if stderr:
            raise AgnosticVExecError(
                "agnosticv execution failed.\n" +
                f"agnosticv {' '.join(cmd)}\n" +
                stderr.decode('utf-8')
            )
        return stdout.decode('utf-8'), stderr.decode('utf-8')

    async def agnosticv_get_all_component_paths(self):
        stdout, stderr = await self.agnosticv_exec(
            '--list', '--has=__meta__', '--dir', self.agnosticv_path
        )
        return stdout.split(), stderr

    async def agnosticv_get_component_paths_from_related_files(self, files, logger):
        if not files:
            return [], ''
        args = ['--list', '--has=__meta__', '--dir', self.agnosticv_path, '--related', files[0]]
        for file in files[1:]:
            args.extend(['--or-related', file])
        logger.debug(f"agnosticv {' '.join(args)}")
        stdout, stderr = await self.agnosticv_exec(*args)
        return stdout.split(), stderr

    async def delete_components(self, logger):
        async for agnosticv_component in AgnosticVComponent.list(
            label_selector = f"{Babylon.agnosticv_repo_label}={self.name}",
            namespace = self.namespace,
        ):
            logger.info(f"Propagating delete of {self} to {agnosticv_component}")
            await agnosticv_component.delete()

    async def get_component_definition(self, source, logger):
        if self.git_checkout_ref != source.ref:
            await self.git_repo_checkout(logger=logger, ref=source.ref)
        stdout, stderr = await self.agnosticv_exec(
            '--merge', os.path.join(self.agnosticv_path, source.path), '--output=json',
        )
        definition = json.loads(stdout)
        if self.anarchy_collections:
            definition['__meta__'].setdefault('anarchy', {})['collections'] = self.anarchy_collections
        definition['__meta__'].setdefault('anarchy', {})['roles'] = self.anarchy_roles

        # Set default exection environment for controller and disable if set without controller.
        if definition['__meta__'].get('ansible_control_plane', {}).get('type') == 'controller':
            if (
                self.default_execution_environment and
                not definition['__meta__'].get('deployer', {}).get('execution_environment')
            ):
                definition['__meta__'].setdefault('deployer', {})['execution_environment'] = self.default_execution_environment
        #elif definition['__meta__'].get('deployer', {}).get('execution_environment'):
        #    del definition['__meta__']['deployer']['execution_environment']

        return definition

    async def get_component_sources(self, changed_only, logger, skip_pr_processing=False):
        # Collect all non-fatal error messages
        error_messages = []

        # Add restriction to changed files if requested
        try:
            if changed_only:
                if self.git_changed_files:
                    component_paths, error_msg = await self.agnosticv_get_component_paths_from_related_files(
                        self.git_changed_files, logger=logger
                    )
                else:
                    component_paths = []
                    error_msg = None

                # This is best-guess logic to avoid a more expensive and
                # complicated means of determining deleted components.
                deleted_component_paths = {
                    path for path in self.git_deleted_files
                    if(
                        not path.startswith('.') and
                        not re.search(r'/\.', path) and
                        not re.search(r'/(account|common)\.(json|ya?ml)$', path) and
                        re.search(r'\.(json|ya?ml)$', path)
                    )
                }
            else:
                component_paths, error_msg = await self.agnosticv_get_all_component_paths()
                deleted_component_paths = set()
        except AgnosticVProcessingError as error:
            raise kopf.TemporaryError(f"{error}", delay=60)

        if error_msg:
            error_messages.append(error_msg)

        # Base list of component sources by path
        component_sources_by_path = {
            path: ComponentSource(
                path, ref=self.git_ref, hexsha=self.git_hexsha
            ) for path in component_paths
        }

        # Calculate deleted component names early for early return cases
        deleted_component_names = {
            path_to_name(path) for path in deleted_component_paths
        }

        if skip_pr_processing:
            logger.info(f"Skipping PR processing for {self.name}: processing only main branch components (skip_pr_processing=True)")
            return list(component_sources_by_path.values()), deleted_component_names, error_messages
        elif self.github_preload_pull_requests:
            # Check if we're in rate limiting backoff period
            if self.is_github_api_rate_limited():
                logger.info(f"GitHub API rate limited for {self.name}, skipping PR processing for this cycle")
                return list(component_sources_by_path.values()), deleted_component_names, error_messages
            
            try:
                github_token = await self.get_github_token()
            except Exception as e:
                logger.error(f"Failed to get GitHub token: {e}. Skipping PR processing.")
                return list(component_sources_by_path.values()), deleted_component_names, error_messages
            
            pull_requests = []
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.github_api_base_url}/pulls",
                    headers = {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + github_token,
                        "X-GitHub-Api-Version": "2022-11-28",
                    }
                ) as response:
                    if response.status == 403:
                        # Rate limited - handle backoff
                        error_text = await response.text()
                        self.handle_github_api_rate_limit(logger)
                        logger.warning(f"GitHub API rate limited (403): {error_text}. Continuing without PR processing for this cycle.")
                        pull_requests = []  # Continue with empty list on API error
                    elif response.status != 200:
                        error_text = await response.text()
                        logger.error(f"GitHub API error {response.status}: {error_text}")
                        pull_requests = []  # Continue with empty list on API error
                    else:
                        # Successful API call
                        self.handle_github_api_success()
                        
                        pull_requests = await response.json()
                        # Ensure we got a list, not an error response
                        if not isinstance(pull_requests, list):
                            logger.error(f"GitHub API returned unexpected response: {pull_requests}")
                            pull_requests = []
                        else:
                            logger.info(f"Found {len(pull_requests)} open PRs to process")
                    
                    # Cleanup: Remove tracking for PRs that are no longer open
                    open_pr_refs = {pr['head']['ref'] for pr in pull_requests}
                    stale_refs = set(self.last_pr_commits.keys()) - open_pr_refs
                    if stale_refs:
                        logger.info(f"Cleaning up {len(stale_refs)} closed/merged PR branches: {sorted(stale_refs)}")
                        # Closing PRs is not a frequent event, so we can afford to do a full scan
                        self._has_closed_prs_this_cycle = True  # Trigger full cleanup scan
                        
                        for stale_ref in stale_refs:
                            del self.last_pr_commits[stale_ref]
                            self.fetched_branches.discard(stale_ref)
                    
                    # Memory management: Enforce size limits on tracking dictionaries
                    await self.enforce_memory_limits(logger=logger)
                    
                    pull_requests.reverse()
                    processed_branches = set()
                    for pull_request in pull_requests:
                        ref = pull_request['head']['ref']
                        pr_number = pull_request['number']
                        current_commit = pull_request['head']['sha']
                        
                        # Check if this branch has changed since last time
                        last_known_commit = self.last_pr_commits.get(ref)
                        is_new_branch = ref not in processed_branches and f'refs/remotes/origin/{ref}' not in self.git_repo.references
                        is_first_time_tracking = last_known_commit is None
                        has_new_commits = last_known_commit != current_commit
                        
                        if is_new_branch or is_first_time_tracking:
                            logger.info(f"New PR branch detected: {ref} (PR #{pr_number})")
                        elif not has_new_commits:
                            logger.debug(f"PR branch {ref} (PR #{pr_number}) unchanged, skipping checkout")
                            # Skip processing - no changes, don't add to processed_branches
                            continue
                        else:
                            logger.info(f"PR branch {ref} (PR #{pr_number}) has new commits: {last_known_commit} -> {current_commit}")
                        
                        processed_branches.add(ref)
                        
                        # Only checkout if the branch is new or has changes
                        try:
                            # First ensure we have the latest commits for this branch
                            remote = self.git_repo.remotes['origin']
                            branch_refspec = f'refs/heads/{ref}:refs/remotes/origin/{ref}'
                            
                            # Create callbacks for authentication if SSH key is provided
                            callbacks = None
                            if self.ssh_key_secret_name and os.path.exists(self.git_ssh_key_path):
                                def credentials_callback(url, username_from_url, allowed_types):
                                    if allowed_types & pygit2.GIT_CREDENTIAL_SSH_KEY:
                                        return pygit2.Keypair(
                                            username='git',
                                            pubkey=f'{self.git_ssh_key_path}.pub',
                                            privkey=self.git_ssh_key_path,
                                            passphrase=''
                                        )
                                    return None
                                
                                def certificate_check_callback(cert, valid, host):
                                    return True
                                    
                                callbacks = pygit2.RemoteCallbacks(
                                    credentials=credentials_callback,
                                    certificate_check=certificate_check_callback
                                )
                            
                            # Fetch the specific branch to get the latest commits
                            remote.fetch(refspecs=[branch_refspec], callbacks=callbacks)
                            
                            # Checkout the specific commit SHA from GitHub API to avoid timing issues
                            # where GitHub API is ahead of Git mirrors
                            checkout_success = False
                            max_retries = 3
                            base_delay = 1  # Start with 1 second
                            
                            for attempt in range(max_retries):
                                try:
                                    await self.git_repo_checkout(logger=logger, ref=current_commit)
                                    logger.debug(f"Successfully checked out commit {current_commit} for PR #{pr_number} (attempt {attempt + 1})")
                                    checkout_success = True
                                    break
                                except kopf.TemporaryError as e:
                                    if "Unable to checkout commit" in str(e) and attempt < max_retries - 1:
                                        # GitHub API might be ahead of Git mirrors, retry with exponential backoff
                                        delay = base_delay * (2 ** attempt)
                                        logger.warning(f"Commit {current_commit} not yet available (attempt {attempt + 1}/{max_retries}), retrying in {delay}s")
                                        await asyncio.sleep(delay)
                                        # Retry fetch to get latest commits
                                        remote.fetch(refspecs=[branch_refspec], callbacks=callbacks)
                                    elif "Unable to checkout commit" in str(e):
                                        # Final attempt failed, fall back to branch checkout
                                        logger.warning(f"All attempts failed to checkout {current_commit}, falling back to branch {ref}")
                                        await self.git_repo_checkout(logger=logger, ref=ref)
                                        checkout_success = True
                                        if self.git_hexsha != current_commit:
                                            logger.info(f"Git mirrors behind GitHub API: expected {current_commit}, got {self.git_hexsha}")
                                        break
                                    else:
                                        raise
                            
                            # Update tracking - use actual checked out commit
                            actual_commit = self.git_hexsha if checkout_success else current_commit
                            self.last_pr_commits[ref] = actual_commit
                            
                            if is_new_branch:
                                logger.info(f"Checked out new PR branch {ref} [{self.git_hexsha}] for PR #{pr_number}")
                            else:
                                logger.info(f"Checked out {ref} [{self.git_hexsha}] for PR #{pr_number}")
                            changed_files = await self.git_changed_files_in_branch(logger=logger, ref=ref)
                        except kopf.TemporaryError:
                            # Branch might not exist locally, skip this PR
                            logger.warning(f"Unable to checkout branch {ref} for PR #{pr_number}, skipping")
                            continue

                        error_message = None
                        try:
                            logger.debug(f"Getting component paths from changed files: {changed_files}")
                            component_paths, error_message = await self.agnosticv_get_component_paths_from_related_files(
                                changed_files, logger=logger
                            )
                            logger.debug(f"Got {component_paths}")
                        except AgnosticVProcessingError as error:
                            error_message = str(error)

                        if error_message:
                            error_message = f"Failed to list all components for PR #{pull_request['number']} {ref}:\n{error_message.rstrip()}\n"
                            logger.warning(error_message)
                            error_messages.append(error_message)
                        else:
                            for path in component_paths:
                                deleted_component_paths.discard(path)
                                component_sources_by_path[path] = ComponentSource(
                                    path,
                                    pull_request_number = pull_request['number'],
                                    ref = ref,
                                    hexsha = self.git_hexsha
                                )

        component_sources = list(component_sources_by_path.values())
        component_sources.sort(key=lambda cs: cs.sortkey)
        
        if self.github_preload_pull_requests:
            skipped_branches = len(pull_requests) - len(processed_branches)
            logger.info(f"Summary for {self.name}: processed {len(processed_branches)}/{len(pull_requests)} PRs (skipped {skipped_branches} unchanged), found {len(component_sources)} total components")
        
        return component_sources, deleted_component_names, error_messages

    async def get_github_token(self):
        secret = await Babylon.core_v1_api.read_namespaced_secret(
            name = self.github_token_secret_name,
            namespace = self.namespace
        )
        secret_data = secret.data.get('token')
        if not secret_data:
            raise kopf.TemporaryError(
                f"Secret {self.github_token_secret_name} does not have token in data",
                delay = 600,
            )
        return b64decode(secret_data).decode('utf-8')

    async def is_pr_closed_without_merge(self, pull_request_number, logger):
        """Check if a PR is closed without being merged using GitHub API"""
        if not self.github_token_secret_name or not pull_request_number:
            return False
        
        # Check if we're in rate limiting backoff period
        if self.is_github_api_rate_limited():
            logger.debug(f"GitHub API rate limited, skipping PR {pull_request_number} status check")
            return False  # Don't delete components during rate limiting
        
        try:
            github_token = await self.get_github_token()
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.github_api_base_url}/pulls/{pull_request_number}",
                    headers = {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + github_token,
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    if response.status == 200:
                        # Successful API call
                        self.handle_github_api_success()
                        
                        pr_data = await response.json()
                        state = pr_data.get('state')
                        merged = pr_data.get('merged', False)
                        
                        # PR is "closed without merge" if state is closed and not merged
                        is_closed_without_merge = (state == 'closed' and not merged)
                        
                        if is_closed_without_merge:
                            logger.debug(f"PR #{pull_request_number} is closed without merge")
                        elif state == 'closed' and merged:
                            logger.debug(f"PR #{pull_request_number} is merged (keeping component)")
                        elif state == 'open':
                            logger.debug(f"PR #{pull_request_number} is still open")
                        
                        return is_closed_without_merge
                    elif response.status == 403:
                        # Rate limited
                        self.handle_github_api_rate_limit(logger)
                        logger.debug(f"GitHub API rate limited while checking PR #{pull_request_number}")
                        return False  # Don't delete components during rate limiting
                    elif response.status == 404:
                        # PR doesn't exist, consider it closed without merge for cleanup
                        logger.debug(f"PR #{pull_request_number} not found, considering it closed without merge")
                        return True
                    else:
                        logger.warning(f"Failed to check PR #{pull_request_number} status: {response.status}")
                        return False
        except Exception as e:
            logger.warning(f"Failed to check if PR #{pull_request_number} is closed without merge: {e}")
            return False

    async def post_pr_success_comment(self, pull_request_number, commit_sha, action_message, logger):
        """Post an immediate success comment to a PR when a component is updated"""
        if not self.github_token_secret_name or not pull_request_number:
            return
        
        try:
            github_token = await self.get_github_token()
            message = (
                f"✅ **{action_message}**\n\n"
                f"Successfully applied revision `{commit_sha}` for integration testing.\n\n"
                f"The updated catalog is available at {self.catalog_url if self.catalog_url else 'the integration environment'}."
            )
            
            async with aiohttp.ClientSession() as session:
                # Post comment
                comment_response = await session.post(
                    f"{self.github_api_base_url}/issues/{pull_request_number}/comments",
                    headers = {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + github_token,
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                    json = {"body": message}
                )
                
                # Add integration label
                label_response = await session.post(
                    f"{self.github_api_base_url}/issues/{pull_request_number}/labels",
                    headers = {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + github_token,
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                    json = {"labels": ["integration"]}
                )
                
                if comment_response.status == 201:
                    logger.info(f"Posted success comment to PR #{pull_request_number}: {action_message}")
                else:
                    logger.warning(f"Failed to post comment to PR #{pull_request_number}: HTTP {comment_response.status}")
        except Exception as e:
            logger.warning(f"Failed to post success comment to PR #{pull_request_number}: {e}")

    async def post_pr_deletion_comment(self, pull_request_number, component_name, logger):
        """Post a comment to a PR when a component used by that PR is affected"""
        if not self.github_token_secret_name or not pull_request_number:
            return
        
        try:
            github_token = await self.get_github_token()
            message = (
                f"🗑️ AgnosticV Component `{component_name}` removed from Integration"
            )
            
            async with aiohttp.ClientSession() as session:
                await session.post(
                    f"{self.github_api_base_url}/issues/{pull_request_number}/comments",
                    headers = {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + github_token,
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                    json = {"body": message}
                )
            logger.info(f"Posted deletion comment for component {component_name} to PR #{pull_request_number}")
        except Exception as e:
            logger.warning(f"Failed to post deletion comment to PR #{pull_request_number}: {e}")

    async def _update_component_pr_list(self, agnosticv_component, pr_number, logger, add=True):
        """Update the list of PRs using this component"""
        pr_list_annotation = f"{Babylon.agnosticv_api_group}/used-by-prs"
        current_prs_str = agnosticv_component.metadata.get('annotations', {}).get(pr_list_annotation, '')
        
        # Parse current PR list
        if current_prs_str:
            current_prs = set(current_prs_str.split(','))
        else:
            current_prs = set()
        
        pr_str = str(pr_number)
        
        if add:
            if pr_str not in current_prs:
                current_prs.add(pr_str)
                updated = True
            else:
                updated = False
        else:
            if pr_str in current_prs:
                current_prs.remove(pr_str)
                updated = True
            else:
                updated = False
        
        if updated:
            new_prs_str = ','.join(sorted(current_prs)) if current_prs else ''
            
            # Check if annotations section exists
            has_annotations = 'annotations' in agnosticv_component.metadata
            
            if new_prs_str:
                if has_annotations:
                    # Update existing annotation
                    patch = [{
                        "op": "add",
                        "path": f"/metadata/annotations/{pr_list_annotation.replace('/', '~1')}",
                        "value": new_prs_str
                    }]
                else:
                    # Create annotations section with the annotation
                    patch = [{
                        "op": "add",
                        "path": "/metadata/annotations",
                        "value": {pr_list_annotation: new_prs_str}
                    }]
            else:
                # Remove the annotation
                if has_annotations:
                    patch = [{
                        "op": "remove", 
                        "path": f"/metadata/annotations/{pr_list_annotation.replace('/', '~1')}"
                    }]
                else:
                    # Nothing to remove if annotations don't exist
                    patch = []
            
            if patch:
                await agnosticv_component.json_patch(patch)
                logger.debug(f"Updated PR list for {agnosticv_component.name}: {new_prs_str}")
        
        return updated

    async def cleanup_components_from_closed_prs(self, logger):
        """Check for components with closed PRs and remove closed PRs from their lists"""
        logger.debug(f"Starting PR cleanup for {self.name}")
        if not self.github_token_secret_name:
            logger.debug(f"No GitHub token for {self.name}, skipping PR cleanup")
            return []
        
        deleted_components = []
        
        async for agnosticv_component in AgnosticVComponent.list(
            label_selector = f"{Babylon.agnosticv_repo_label}={self.name}",
            namespace = self.namespace,
        ):
            # Check if this component has the "used-by-prs" annotation
            pr_list_annotation = f"{Babylon.agnosticv_api_group}/used-by-prs"
            pr_list_str = agnosticv_component.metadata.get('annotations', {}).get(pr_list_annotation)
            
            # Only process components that have the PR tracking annotation
            if pr_list_str:
                pr_numbers = pr_list_str.split(',')
                active_prs = []  # Open PRs or merged PRs (keep component)
                closed_without_merge_prs = []  # Closed without merge PRs (remove component)
                
                for pr_str in pr_numbers:
                    try:
                        pr_number = int(pr_str.strip())
                        is_closed_without_merge = await self.is_pr_closed_without_merge(pr_number, logger)
                        
                        if is_closed_without_merge:
                            closed_without_merge_prs.append(pr_number)
                        else:
                            # PR is either open or merged (both keep the component)
                            active_prs.append(pr_str.strip())
                            
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Invalid PR number in list for component {agnosticv_component.name}: {pr_str}")
                        # Keep invalid PR numbers in the list to avoid data loss
                        active_prs.append(pr_str.strip())
                
                # If there are PRs closed without merge, update the annotation or delete the component
                if closed_without_merge_prs:
                    if active_prs:
                        # Some PRs are still active (open or merged), just remove the closed ones from the list
                        new_pr_list = ','.join(sorted(active_prs))
                        escaped_annotation = pr_list_annotation.replace('/', '~1')
                        patch = [{
                            "op": "add",
                            "path": f"/metadata/annotations/{escaped_annotation}",
                            "value": new_pr_list
                        }]
                        await agnosticv_component.json_patch(patch)
                        logger.info(f"Removed closed-without-merge PRs {closed_without_merge_prs} from component {agnosticv_component.name}, still used by PRs: {active_prs}")
                        
                        # No need to comment on closed PRs when component still exists and is used by other PRs
                    else:
                        # No active PRs left, delete the component entirely
                        logger.info(f"Deleting component {agnosticv_component.name} because all PRs {closed_without_merge_prs} were closed without merge")
                        
                        # Post comments to all closed-without-merge PRs (component being deleted)
                        for pr_number in closed_without_merge_prs:
                            await self.post_pr_deletion_comment(pr_number, agnosticv_component.name, logger)
                        
                        # Delete the component
                        await agnosticv_component.delete()
                        deleted_components.append(agnosticv_component.name)
        
        if deleted_components:
            logger.info(f"Cleaned up {len(deleted_components)} components from closed PRs: {deleted_components}")
        
        return deleted_components

    async def get_ssh_key(self):
        secret = await Babylon.core_v1_api.read_namespaced_secret(
            name = self.ssh_key_secret_name,
            namespace = self.namespace
        )
        secret_data = secret.data.get('ssh-privatekey', secret.data.get('id_rsa'))
        if not secret_data:
            raise kopf.TemporaryError(
                f"Secret {self.ssh_key_secret_name} does not have ssh-privatekey or id_rsa in data",
                delay = 600,
            )
        return b64decode(secret_data).decode('utf-8')

    async def git_changed_files_in_branch(self, logger, ref):
        files, error_message = await asyncio.get_event_loop().run_in_executor(
            None, self.__git_changed_files_in_branch, logger, ref
        )
        if error_message:
            logger.warning(error_message)
        return files

    async def git_repo_checkout(self, logger, ref=None):
        if not ref:
            ref = self.git_ref
        if ref == self.git_checkout_ref:
            return

        await asyncio.get_event_loop().run_in_executor(
            None, functools.partial(
                self.__git_repo_checkout, logger=logger, ref=ref
            )
        )

    async def git_repo_delete(self, logger):
        try:
            await aioshutil.rmtree(self.git_repo_path)
        except FileNotFoundError:
            pass
        try:
            await aiofiles.os.unlink(self.git_ssh_key_path)
        except FileNotFoundError:
            pass
        try:
            await aiofiles.os.unlink(f'{self.git_ssh_key_path}.pub')
        except FileNotFoundError:
            pass

    async def git_repo_sync(self, logger):
        if self.ssh_key_secret_name:
            await self.git_ssh_key_write()
        if await aiofiles.os.path.exists(self.git_repo_path):
            # For existing repos, use GitHub API pre-check to avoid unnecessary git fetches
            if await self.__has_remote_changes(logger):
                await asyncio.get_event_loop().run_in_executor(
                    None, self.__git_repo_pull, logger
                )
            else:
                logger.info(f"No remote changes detected for {self.name}, skipping git fetch")
        else:
            await asyncio.get_event_loop().run_in_executor(
                None, self.__git_repo_clone, logger
            )

    async def git_ssh_key_write(self):
        await aiofiles.os.makedirs(self.git_base_path, exist_ok=True)
        
        # Write private key
        private_key_content = await self.get_ssh_key()
        async with aiofiles.open(self.git_ssh_key_path, mode='w') as fh:
            await fh.write(private_key_content)
        await aiofiles.os.chmod(self.git_ssh_key_path, 0o600)
        
        # Generate public key from private key for pygit2
        # For pygit2, we need to extract the public key from the private key
        try:
            result = await asyncio.create_subprocess_exec(
                'ssh-keygen', '-y', '-f', self.git_ssh_key_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await result.communicate()
            if result.returncode == 0:
                async with aiofiles.open(f'{self.git_ssh_key_path}.pub', mode='w') as fh:
                    await fh.write(stdout.decode('utf-8'))
                await aiofiles.os.chmod(f'{self.git_ssh_key_path}.pub', 0o644)
            else:
                # Fallback: create a dummy public key file to avoid pygit2 errors
                async with aiofiles.open(f'{self.git_ssh_key_path}.pub', mode='w') as fh:
                    await fh.write('')
        except Exception:
            # If ssh-keygen fails, create empty public key file to avoid errors
            async with aiofiles.open(f'{self.git_ssh_key_path}.pub', mode='w') as fh:
                await fh.write('')

    async def git_repo_cleanup(self, logger):
        """
        Perform git repository cleanup including:
        - Remove stale remote branches that no longer exist
        - Run git garbage collection to optimize storage
        - Prune unreachable objects
        """
        if not self.git_repo:
            return
            
        now = datetime.now(timezone.utc).timestamp()
        if (self.last_cleanup_time and 
            now - self.last_cleanup_time < self.cleanup_interval):
            return
            
        try:
            logger.info(f"Starting git repository cleanup for {self.name}")
            
            # Get list of remote branches that no longer exist
            remote = self.git_repo.remotes['origin']
            
            # Fetch to update remote refs (lightweight operation)
            callbacks = None
            if self.ssh_key_secret_name and os.path.exists(self.git_ssh_key_path):
                def credentials_callback(url, username_from_url, allowed_types):
                    if allowed_types & pygit2.GIT_CREDENTIAL_SSH_KEY:
                        return pygit2.Keypair(
                            username='git',
                            pubkey=f'{self.git_ssh_key_path}.pub',
                            privkey=self.git_ssh_key_path,
                            passphrase=''
                        )
                    return None
                
                def certificate_check_callback(cert, valid, host):
                    return True
                    
                callbacks = pygit2.RemoteCallbacks(
                    credentials=credentials_callback,
                    certificate_check=certificate_check_callback
                )
            
            # Prune remote branches (remove refs to deleted branches)
            remote.fetch(callbacks=callbacks, prune=True)
            
            # Run git garbage collection using subprocess for better control
            proc = await asyncio.create_subprocess_exec(
                'git', '-C', self.git_repo_path, 'gc', '--auto', '--prune=now',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            
            if proc.returncode == 0:
                logger.info(f"Git cleanup completed successfully for {self.name}")
                if stdout:
                    logger.debug(f"Git gc output: {stdout.decode('utf-8').strip()}")
            else:
                logger.warning(f"Git cleanup had issues for {self.name}: {stderr.decode('utf-8').strip()}")
            
            self.last_cleanup_time = now
            
        except Exception as e:
            logger.warning(f"Git cleanup failed for {self.name}: {e}")

    async def enforce_memory_limits(self, logger):
        """
        Enforce memory limits on tracking dictionaries to prevent unbounded growth.
        Remove oldest entries when limits are exceeded.
        """
        # Limit PR commit tracking dictionary
        if len(self.last_pr_commits) > self.max_tracked_pr_commits:
            excess_count = len(self.last_pr_commits) - self.max_tracked_pr_commits
            # Remove oldest entries (dict maintains insertion order in Python 3.7+)
            oldest_refs = list(self.last_pr_commits.keys())[:excess_count]
            for ref in oldest_refs:
                del self.last_pr_commits[ref]
            logger.info(f"Memory cleanup: removed {excess_count} oldest PR commit entries from tracking")
        
        # Limit fetched branches set
        if len(self.fetched_branches) > self.max_fetched_branches:
            excess_count = len(self.fetched_branches) - self.max_fetched_branches
            # For sets, we can't easily determine "oldest", so remove some arbitrary entries
            # In practice, this shouldn't happen often since we clean up closed PRs
            excess_branches = list(self.fetched_branches)[:excess_count]
            for branch in excess_branches:
                self.fetched_branches.discard(branch)
            logger.info(f"Memory cleanup: removed {excess_count} branch entries from fetched tracking")

    async def handle_create(self, logger):
        # Initial creation requires full processing to establish baseline
        logger.info(f"handle_create triggered for {self.name}")
        await self.manage_components(logger=logger, changed_only=False)

    async def handle_delete(self, logger):
        await self.git_repo_delete(logger=logger)
        await self.delete_components(logger=logger)

    async def handle_resume(self, logger):
        # Resume operations should use incremental processing for efficiency
        logger.debug(f"handle_resume triggered for {self.name}")
        await self.manage_components(logger=logger, changed_only=False)

    async def handle_update(self, logger):
        # Update operations should use incremental processing for efficiency  
        logger.debug(f"handle_update triggered for {self.name}")
        await self.manage_components(logger=logger, changed_only=True)

    async def manage_component(self, source, logger):
        definition = await self.get_component_definition(source=source, logger=logger)

        self.validate_component_definition(definition=definition, source=source)

        try:
            agnosticv_component = await AgnosticVComponent.fetch(name=source.name, namespace=self.namespace)
            if agnosticv_component.agnosticv_repo != self.name:
                raise AgnosticVConflictError(
                    f"{source} conflicts with {agnosticv_component} from AgnosticVRepo {self.agnosticv_repo}"
                )
            elif agnosticv_component.path != source.path:
                raise AgnosticVConflictError(
                    f"{source} conflicts with {agnosticv_component} at path {agnosticv_component.path}"
                )

            patch = []
            definition_changed = agnosticv_component.definition != definition
            if definition_changed:
                logger.info(f"Component {source.name} definition changed for PR #{source.pull_request_number}")
            else:
                logger.debug(f"Component {source.name} definition unchanged for PR #{source.pull_request_number}")
            
            if definition_changed:
                patch.append({
                    "op": "add",
                    "path": "/spec/definition",
                    "value": definition,
                })

            if source.pull_request_number:
                commit_hash_changed = agnosticv_component.pull_request_commit_hash != source.hexsha
                logger.info(f"PR #{source.pull_request_number} commit hash: {agnosticv_component.pull_request_commit_hash} -> {source.hexsha} (changed: {commit_hash_changed})")
                if commit_hash_changed:
                    patch.append({
                        "op": "add",
                        "path": "/spec/pullRequestCommitHash",
                        "value": source.hexsha,
                    })
                if agnosticv_component.pull_request_number != source.pull_request_number:
                    patch.append({
                        "op": "add",
                        "path": "/spec/pullRequestNumber",
                        "value": source.pull_request_number,
                    })
            else:
                if agnosticv_component.pull_request_commit_hash:
                    patch.append({
                        "op": "remove",
                        "path": "/spec/pullRequestCommitHash",
                    })
                if agnosticv_component.pull_request_number:
                    patch.append({
                        "op": "remove",
                        "path": "/spec/pullRequestNumber",
                    })

            # Update the list of PRs using this component
            pr_annotation_updated = False
            if source.pull_request_number:
                pr_annotation_updated = await self._update_component_pr_list(
                    agnosticv_component, source.pull_request_number, logger, add=True
                )
            
            if patch or pr_annotation_updated:
                if patch:
                    await agnosticv_component.json_patch(patch)
                
                # Only return "updated" for meaningful changes (definition changes)
                # Commit hash updates without definition changes should be "unchanged"
                if definition_changed:
                    logger.info(f"Updating {agnosticv_component} definition for {source}")
                    return "updated"
                else:
                    logger.debug(f"Updated metadata for {agnosticv_component} (definition unchanged)")
                    return "unchanged"

            logger.debug(f"{agnosticv_component} unchanged")
            return "unchanged"

        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status == 404:
                logger.info(f"Creating AgnosticVComponent for {source}")
                spec = {
                    "agnosticvRepo": self.name,
                    "definition": definition,
                    "path": source.path,
                }
                
                metadata = {
                    "labels": {
                        Babylon.agnosticv_repo_label: self.name,
                    },
                    "name": source.name,
                    "namespace": self.namespace,
                    "ownerReferences": [self.as_owner_ref()],
                }
                
                # Add annotation to track which PRs are using this component
                if source.pull_request_number:
                    metadata.setdefault("annotations", {})[f"{Babylon.agnosticv_api_group}/used-by-prs"] = str(source.pull_request_number)
                
                agnosticv_component = await AgnosticVComponent.create({
                    "metadata": metadata,
                    "spec": spec,
                })
                
                return "created"
            else:
                raise

    async def manage_components(self, logger, changed_only=False, skip_pr_processing=False):
        try:
            await self.__manage_components(changed_only=changed_only, logger=logger, skip_pr_processing=skip_pr_processing)
        except AgnosticVProcessingError as error:
            await self.merge_patch_status({
                "error": {
                    "message": str(error),
                    "timestamp": datetime.now(timezone.utc).strftime('%FT%TZ'),
                }
            })
            logger.error(str(error))
        except Exception as error:
            logger.exception("manage_components failed with unexpected error.")
            await self.merge_patch_status({
                "error": {
                    "message": traceback.format_exc(),
                    "timestamp": datetime.now(timezone.utc).strftime('%FT%TZ'),
                }
            })

    async def __manage_components(self, logger, changed_only, skip_pr_processing=False):
        logger.debug(f"Starting manage_components for {self.name} (changed_only={changed_only}, skip_pr_processing={skip_pr_processing})")
        # Reset flag for detecting closed PRs in this cycle
        self._has_closed_prs_this_cycle = False
        
        await self.git_repo_sync(logger=logger)
        # Periodic cleanup of git repository and stale branch tracking
        await self.git_repo_cleanup(logger=logger)
        
        # Cleanup components from closed PRs (only if not skipping PR processing)
        if skip_pr_processing:
            logger.debug(f"Skipping PR cleanup for {self.name}: skip_pr_processing=True")
            deleted_from_closed_prs = []
        elif self.github_preload_pull_requests:
            logger.debug(f"Checking PR cleanup for {self.name}: github_preload_pull_requests={self.github_preload_pull_requests}")
            deleted_from_closed_prs = await self.cleanup_components_from_closed_prs(logger=logger)
        else:
            logger.debug(f"Skipping PR cleanup for {self.name}: preloadPullRequests not enabled")
            deleted_from_closed_prs = []
        
        # Store the hexsha to record in status if successful
        git_hexsha = self.git_hexsha

        if changed_only:
            if git_hexsha == self.last_successful_git_hexsha:
                # If GitHub preload PRs is enabled, we still need to process PRs even if main branch unchanged
                if self.github_preload_pull_requests:
                    logger.debug(f"Main branch unchanged, processing PRs for {self.name} [{git_hexsha}]")
                else:
                    logger.debug(f"Repository {self.name} unchanged [{git_hexsha}]")
                    return
            elif self.last_successful_git_hexsha:
                logger.info(f"Updating components for {self.name} from {self.last_successful_git_hexsha} to {git_hexsha}")
            else:
                logger.info(f"Initial processing for {self.name} [{git_hexsha}]")
        else:
            # Full processing - always process regardless of git SHA
            if self.last_successful_git_hexsha:
                logger.info(f"Starting full component processing for {self.name} [{git_hexsha}]")
            else:
                logger.info(f"Starting full component processing for {self.name} (initial) [{git_hexsha}]")

        pr_hexsha = {}
        pr_messages = {}
        errors = {}
        component_sources, deleted_component_names, get_component_sources_error_messages = await self.get_component_sources(
            changed_only = changed_only,
            logger = logger,
            skip_pr_processing = skip_pr_processing,
        )
        handled_component_names = set()

        # If incremental processing finds no components and no deletions, nothing to do
        if changed_only and not component_sources and not deleted_component_names and not get_component_sources_error_messages and not deleted_from_closed_prs:
            # Check if there were any changes detected (main branch or PRs)
            if git_hexsha == self.last_successful_git_hexsha:
                logger.debug(f"No changes detected for {self.name}, skipping component management")
                return

        # When syncing changed only we get a set of deleted component names
        for name in deleted_component_names:
            try:
                agnosticv_component = await AgnosticVComponent.fetch(name=name)
                if not agnosticv_component.deletion_timestamp:
                    logger.info(f"Deleting AgnosticVComponent {name} after deleted from {self}")
                    await agnosticv_component.delete()
            except kubernetes_asyncio.client.rest.ApiException as e:
                if e.status != 404:
                    raise

        for source in component_sources:
            try:
                result = await self.manage_component(source=source, logger=logger)
                handled_component_names.add(source.name)
                if not source.pull_request_number:
                    continue
                pr_hexsha[source.pull_request_number] = source.hexsha
                if result == 'created':
                    pr_messages.setdefault(source.pull_request_number, []).append(
                        f"Created AgnosticVComponent `{source.name}`"
                    )
                    logger.info(f"Added created message for PR #{source.pull_request_number}: {source.name}")
                elif result == 'updated':
                    pr_messages.setdefault(source.pull_request_number, []).append(
                        f"Updated AgnosticVComponent `{source.name}`"
                    )
                    logger.info(f"Added updated message for PR #{source.pull_request_number}: {source.name}")
                elif result == 'unchanged':
                    pr_messages.setdefault(source.pull_request_number, []).append(
                        f"Component `{source.name}` up to date (no change)"
                    )
                    logger.info(f"Added unchanged message for PR #{source.pull_request_number}: {source.name}")
                else:
                    logger.info(f"Component {source.name} result was '{result}' for PR #{source.pull_request_number} - no message added")
            except AgnosticVProcessingError as error:
                errors.setdefault(source.pull_request_number, []).append(error)
                logger.info(f"Added error for PR #{source.pull_request_number}: {error}")

        github_token = None
        # Post error-only comments for PRs that had errors but no successful components
        for pull_request_number, prerrors in errors.items():
            if not pull_request_number or pull_request_number in pr_messages:
                continue  # Skip if already handled above
            if not github_token:
                github_token = await self.get_github_token()
            message = "❌ **Error applying pull request for integration:**\n\n" + "\n".join(
                [f"• {str(error)}" for error in prerrors]
            )

            async with aiohttp.ClientSession() as session:
                await session.post(
                    f"{self.github_api_base_url}/issues/{pull_request_number}/comments",
                    headers = {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + github_token,
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                    json = {"body": message},
                )


        for pull_request_number, messages in pr_messages.items():
            if not pull_request_number:
                continue
            try:
                if not github_token:
                    github_token = await self.get_github_token()
                
                # Check if this PR also has errors
                pr_errors = errors.get(pull_request_number, [])
                
                # Get commit SHA for this PR
                commit_sha = pr_hexsha.get(pull_request_number, "unknown")
                
                if pr_errors:
                    # PR has both successes and errors - post combined message
                    message = (
                        f"⚠️ **Partially applied revision {commit_sha}**\n\n" +
                        "**Successfully updated components:**\n" +
                        "\n".join([f"• {msg}" for msg in messages]) + "\n\n" +
                        "**Errors encountered:**\n" +
                        "\n".join([f"• {str(error)}" for error in pr_errors])
                    )
                else:
                    # Check if this is all "no change" vs actual updates
                    unchanged_count = sum(1 for msg in messages if "up to date (no change)" in msg)
                    total_count = len(messages)
                    
                    if unchanged_count == total_count:
                        # All components were unchanged - skip comment for polling cycles
                        # Only webhook events (opened/synchronized) should get "no changes" comments
                        logger.debug(f"Skipping 'no changes' comment for PR #{pull_request_number} (polling cycle)")
                        message = None  # Skip comment but still add label
                    else:
                        # Mixed results or all updates
                        message = (
                            f"✅ **Successfully applied revision {commit_sha}**\n\n" +
                            "Components processed for integration testing:\n" +
                            "\n".join([f"• {msg}" for msg in messages])
                        )
                    
                if self.catalog_url:
                    message += f"\n\nThe updated catalog is available at {self.catalog_url}"

                async with aiohttp.ClientSession() as session:
                    # Only post comment if message is not None
                    if message:
                        comment_response = await session.post(
                            f"{self.github_api_base_url}/issues/{pull_request_number}/comments",
                            headers = {
                                "Accept": "application/vnd.github+json",
                                "Authorization": "Bearer " + github_token,
                                "X-GitHub-Api-Version": "2022-11-28",
                            },
                            json = {"body": message}
                        )
                        
                        if comment_response.status == 201:
                            logger.info(f"Posted success comment to PR #{pull_request_number}")
                        else:
                            logger.warning(f"Failed to post comment to PR #{pull_request_number}: HTTP {comment_response.status}")
                    else:
                        logger.debug(f"Skipped comment for PR #{pull_request_number} (no changes during polling)")
                    
                    # Always add integration label regardless of comment
                    await session.post(
                        f"{self.github_api_base_url}/issues/{pull_request_number}/labels",
                        headers = {
                            "Accept": "application/vnd.github+json",
                            "Authorization": "Bearer " + github_token,
                            "X-GitHub-Api-Version": "2022-11-28",
                        },
                        json = {"labels": ["integration"]}
                    )
                        
            except Exception as e:
                logger.warning(f"Failed to post success comment to PR #{pull_request_number}: {e}")

        if errors or get_component_sources_error_messages:
            error_messages = deepcopy(get_component_sources_error_messages)
            raise AgnosticVProcessingError(
                "AgnosticVRepo processing failed:\n\n" +
                "\n".join(
                    get_component_sources_error_messages +
                    [str(error) for prerrors in errors.values() for error in prerrors]
                )
            )

        await self.merge_patch_status({
            "error": None,
            "git": {
                "commit": git_hexsha,
            }
        })

        # Delete components when we've done a full scan OR when we have specific deletions
        # For incremental updates, we can't safely determine what should be deleted
        # unless we specifically detected deleted files
        if not changed_only:
            async for agnosticv_component in AgnosticVComponent.list(
                label_selector = f"{Babylon.agnosticv_repo_label}={self.name}",
                namespace = self.namespace,
            ):
                if agnosticv_component.name not in handled_component_names:
                    logger.info(f"Deleting {agnosticv_component} after deleted from {self}")
                    await agnosticv_component.delete()

        # Only log completion message when actual changes were processed
        if git_hexsha != self.last_successful_git_hexsha or not self.last_successful_git_hexsha:
            logger.info(f"Finished managing components for {self.name} [{git_hexsha}]")
        else:
            logger.debug(f"Completed processing for {self.name} (no changes)")

    async def manage_single_pr(self, pr_number, head_ref, head_sha, logger):
        """Process a single specific PR for webhook events"""
        logger.info(f"Processing single PR #{pr_number} ({head_ref} -> {head_sha})")
        
        # Ensure git repo is ready
        await self.git_repo_sync(logger=logger)
        
        # Fetch/checkout the specific PR branch
        try:
            # First ensure we have the latest commits for this branch
            remote = self.git_repo.remotes['origin']
            branch_refspec = f'refs/heads/{head_ref}:refs/remotes/origin/{head_ref}'
            
            # Create callbacks for authentication if SSH key is provided
            callbacks = None
            if self.ssh_key_secret_name:
                callbacks = pygit2.RemoteCallbacks(
                    credentials=pygit2.Keypair(
                        username='git',
                        pubkey=f'{self.git_ssh_key_path}.pub',
                        privkey=self.git_ssh_key_path,
                        passphrase=''
                    )
                )
            
            # Fetch this specific branch
            remote.fetch([branch_refspec], callbacks=callbacks)
            logger.debug(f"Fetched branch {head_ref}")
            
            # Checkout the PR branch
            branch_ref = self.git_repo.references[f'refs/remotes/origin/{head_ref}']
            target_commit = self.git_repo.get(branch_ref.target)
            self.git_repo.checkout_tree(target_commit)
            
            # Use string conversion for set_head (compatible with all pygit2 versions)
            target_sha = str(branch_ref.target)
            self.git_repo.set_head(f'refs/remotes/origin/{head_ref}')
            self.git_hexsha = target_sha
            self.git_checkout_ref = head_ref
            
            logger.info(f"Checked out {head_ref} [{self.git_hexsha}] for PR #{pr_number}")
            
        except (pygit2.GitError, KeyError) as e:
            logger.warning(f"Unable to checkout branch {head_ref} for PR #{pr_number}: {e}")
            raise kopf.TemporaryError(f"Failed to checkout PR branch {head_ref}: {e}", delay=60)
        
        # Update tracking
        self.last_pr_commits[f"pr-{pr_number}"] = head_sha
        
        # Get only the components that changed in this specific PR
        try:
            # Get the files that changed in this PR compared to the base branch
            changed_files = await self.git_changed_files_in_branch(logger=logger, ref=head_ref)
            logger.info(f"PR #{pr_number} changed {len(changed_files)} files: {changed_files[:10]}...")
            
            if changed_files:
                component_paths, error_msg = await self.agnosticv_get_component_paths_from_related_files(
                    changed_files, logger=logger
                )
                if error_msg:
                    logger.warning(f"Error getting component paths for PR #{pr_number}: {error_msg}")
                    component_paths = []
            else:
                logger.info(f"No changed files detected in PR #{pr_number}")
                component_paths = []
            
            component_sources = [
                ComponentSource(
                    path, ref=head_ref, hexsha=self.git_hexsha, pull_request_number=pr_number
                ) for path in component_paths
            ]
            
            logger.info(f"Found {len(component_sources)} components affected by PR #{pr_number}")
            
        except Exception as e:
            logger.error(f"Failed to get components for PR #{pr_number}: {e}")
            component_sources = []
        
        # Process each component
        pr_messages = []
        errors = []
        
        for source in component_sources:
            try:
                logger.debug(f"Processing component {source.name} for PR #{pr_number}")
                result = await self.manage_component(source=source, logger=logger)
                
                if result == 'created':
                    pr_messages.append(f"Created AgnosticVComponent `{source.name}`")
                    logger.info(f"Created component {source.name} for PR #{pr_number}")
                elif result == 'updated':
                    pr_messages.append(f"Updated AgnosticVComponent `{source.name}`")
                    logger.info(f"Updated component {source.name} for PR #{pr_number}")
                elif result == 'unchanged':
                    pr_messages.append(f"Component `{source.name}` up to date (no change)")
                    logger.info(f"Component {source.name} unchanged for PR #{pr_number}")
                
            except AgnosticVProcessingError as error:
                errors.append(str(error))
                logger.error(f"Error processing component {source.name} for PR #{pr_number}: {error}")
        
        # Post GitHub comment
        if errors:
            message = "❌ **Error applying pull request for integration:**\n\n" + "\n".join(
                [f"• {error}" for error in errors]
            )
        elif pr_messages:
            if all("up to date" in msg for msg in pr_messages):
                message = f"✅ **No changes detected in revision {head_sha[:8]}**\n\nAll components remain up to date."
            else:
                message = (
                    f"✅ **Successfully applied revision {head_sha[:8]}**\n\n" +
                    "Components processed for integration testing:\n" +
                    "\n".join([f"• {msg}" for msg in pr_messages])
                )
        else:
            message = f"ℹ️ **No components found in revision {head_sha[:8]}**"
        
        if self.catalog_url:
            message += f"\n\nThe updated catalog is available at {self.catalog_url}"
        
        # Post the comment
        try:
            github_token = await self.get_github_token()
            if github_token:
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{self.github_api_base_url}/issues/{pr_number}/comments",
                        headers={
                            "Authorization": f"token {github_token}",
                            "Accept": "application/vnd.github.v3+json",
                            "Content-Type": "application/json",
                        },
                        json={"body": message},
                    ) as response:
                        if response.status == 201:
                            logger.info(f"Posted comment to PR #{pr_number}")
                        else:
                            logger.warning(f"Failed to post comment to PR #{pr_number}: HTTP {response.status}")
            else:
                logger.debug(f"No GitHub token available, skipping comment for PR #{pr_number}")
                
        except Exception as e:
            logger.warning(f"Failed to post comment to PR #{pr_number}: {e}")
        
        logger.info(f"Completed processing PR #{pr_number}")


class ComponentSource:
    def __init__(self, path, ref, hexsha, pull_request_number=None):
        self.hexsha = hexsha
        self.name = path_to_name(path)
        self.path = path
        self.pull_request_number = pull_request_number
        self.ref = ref
        self.sortkey = f"{pull_request_number or 0:09d} {path}"

    def __str__(self):
        if self.pull_request_number:
            return f"{self.path} [PR {self.pull_request_number}]"
        else:
            return self.path
