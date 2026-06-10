import { extractShowroomUsersFromClaims } from './showroomLinksFromClaims';
import { ResourceClaim } from '@app/types';

const BABYLON = 'babylon.gpte.redhat.com';

function makeClaim(overrides: Partial<ResourceClaim> & { summaryUsers?: Record<string, unknown> }): ResourceClaim {
  const { summaryUsers, ...rest } = overrides;
  return {
    apiVersion: 'v1',
    kind: 'ResourceClaim',
    metadata: {
      name: 'rc-1',
      namespace: 'ns',
      uid: 'uid-1',
      ...rest.metadata,
    },
    spec: { resources: [] },
    status: {
      lifespan: { end: '' },
      resourceHandle: { name: 'h', kind: 'ResourceHandle', apiVersion: 'v1', uid: 'u' },
      resources: [],
      summary: summaryUsers
        ? { state: 'Ready', provision_data: { users: summaryUsers } }
        : rest.status?.summary,
      ...rest.status,
    },
    ...rest,
  } as ResourceClaim;
}

describe('extractShowroomUsersFromClaims', () => {
  it('builds health URLs from showroom_primary_view_url', () => {
    const rc = makeClaim({
      summaryUsers: {
        user1: { showroom_primary_view_url: 'https://show.example.com/lab/user1/' },
      },
    });
    const rows = extractShowroomUsersFromClaims([rc]);
    expect(rows).toHaveLength(1);
    expect(rows[0].userName).toBe('user1');
    expect(rows[0].showroomUrl).toContain('show.example.com');
    expect(rows[0].healthzUrl).toBe('https://show.example.com/healthz');
    expect(rows[0].readyzUrl).toBe('https://show.example.com/readyz');
  });

  it('prefers labUserInterfaceUrls annotation', () => {
    const rc = makeClaim({
      metadata: {
        name: 'rc-1',
        namespace: 'ns',
        uid: 'uid-1',
        annotations: {
          [`${BABYLON}/labUserInterfaceUrls`]: JSON.stringify({
            user1: 'https://ann.example.com/x',
          }),
        },
      },
      summaryUsers: { user1: {} },
    });
    const rows = extractShowroomUsersFromClaims([rc]);
    expect(rows[0].showroomUrl).toBe('https://ann.example.com/x');
    expect(rows[0].healthzUrl).toBe('https://ann.example.com/healthz');
  });
});
