import { BABYLON_DOMAIN } from '@app/util';
import { ResourceClaim } from '@app/types';

export interface ShowroomUserRow {
  userName: string;
  showroomUrl: string;
  healthzUrl: string;
  readyzUrl: string;
}

type UserProvisionData = {
  labUserInterfaceUrl?: string;
  lab_ui_url?: string;
  bookbag_url?: string;
  showroom_primary_view_url?: string;
};

/** Narrow ResourceHandleResource.state for provision_data.users (matches ServiceUsers). */
type ResourceWithProvisionUsers = {
  state?: {
    spec?: {
      vars?: {
        provision_data?: { users?: Record<string, UserProvisionData> };
      };
    };
  };
};

function pickLabUrl(
  userName: string,
  userData: UserProvisionData,
  labUserInterfaceUrls: Record<string, string>,
): string | null {
  const raw =
    labUserInterfaceUrls[userName] ||
    userData.labUserInterfaceUrl ||
    userData.lab_ui_url ||
    userData.bookbag_url ||
    userData.showroom_primary_view_url;
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href.split('#')[0];
    }
  } catch {
    try {
      return new URL(`https://${trimmed}`).href;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Merge provision user maps and annotation overrides from ResourceClaims (same rules as ServiceUsers).
 */
export function extractShowroomUsersFromClaims(claims: ResourceClaim[]): ShowroomUserRow[] {
  const users: Record<string, UserProvisionData> = {};
  const labUserInterfaceUrls: Record<string, string> = {};

  for (const resourceClaim of claims) {
    try {
      const ann = JSON.parse(resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceUrls`] || '{}');
      if (ann && typeof ann === 'object') {
        for (const [k, v] of Object.entries(ann)) {
          if (typeof v === 'string') labUserInterfaceUrls[k] = v;
        }
      }
    } catch {
      /* ignore bad JSON */
    }

    for (const status_resource of resourceClaim?.status?.resources || []) {
      const resource_users = (status_resource as ResourceWithProvisionUsers).state?.spec?.vars?.provision_data
        ?.users;
      if (resource_users) {
        Object.assign(users, resource_users);
      }
    }
    const summaryUsers = resourceClaim?.status?.summary?.provision_data?.users;
    if (summaryUsers) {
      Object.assign(users, summaryUsers);
    }
  }

  const result: ShowroomUserRow[] = [];
  for (const [userName, userData] of Object.entries(users)) {
    const showroomUrl = pickLabUrl(userName, userData, labUserInterfaceUrls);
    if (!showroomUrl) continue;
    let origin: string;
    try {
      origin = new URL(showroomUrl).origin;
    } catch {
      continue;
    }
    result.push({
      userName,
      showroomUrl,
      healthzUrl: `${origin}/healthz`,
      readyzUrl: `${origin}/readyz`,
    });
  }

  result.sort((a, b) => a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' }));
  return result;
}
