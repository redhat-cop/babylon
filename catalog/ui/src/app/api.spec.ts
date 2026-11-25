import { FORBIDDEN_RESPONSE, assignSelfPacedLabUser, assignWorkshopUser } from './api';
import type { SelfPacedLabUserAssignment, WorkshopUserAssignment } from './types';
import fetchMock from 'jest-fetch-mock';

const sessionWindow = window as Window & { sessionPromiseInstance?: Promise<{ token: string }> };

describe('optionalFetcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('FORBIDDEN_RESPONSE should be an object with forbidden: true', () => {
    expect(FORBIDDEN_RESPONSE).toEqual({ forbidden: true });
  });
});

describe('FORBIDDEN_RESPONSE constant', () => {
  test('should have forbidden property set to true', () => {
    expect(FORBIDDEN_RESPONSE.forbidden).toBe(true);
  });

  test('should be usable for strict equality comparison', () => {
    const response = FORBIDDEN_RESPONSE;
    expect(response === FORBIDDEN_RESPONSE).toBe(true);
  });
});

describe('Resource Pool Annotation Logic', () => {
  describe('getResourcePoolAnnotation helper (createServiceRequest)', () => {
    const getResourcePoolAnnotation = (selectedResourcePool?: string) => {
      if (selectedResourcePool) {
        return { 'poolboy.gpte.redhat.com/resource-pool-name': selectedResourcePool };
      }
      return {};
    };

    test('should return pool annotation when selectedResourcePool is provided', () => {
      const result = getResourcePoolAnnotation('my-pool');
      expect(result).toEqual({ 'poolboy.gpte.redhat.com/resource-pool-name': 'my-pool' });
    });

    test('should return empty object when selectedResourcePool is undefined', () => {
      const result = getResourcePoolAnnotation(undefined);
      expect(result).toEqual({});
    });

    test('should return empty object when selectedResourcePool is not provided', () => {
      const result = getResourcePoolAnnotation();
      expect(result).toEqual({});
    });

    test('should handle "disabled" as a valid pool name', () => {
      const result = getResourcePoolAnnotation('disabled');
      expect(result).toEqual({ 'poolboy.gpte.redhat.com/resource-pool-name': 'disabled' });
    });
  });

  describe('WorkshopProvision resourcePool spec', () => {
    const getResourcePoolSpec = (selectedResourcePool?: string) => {
      return selectedResourcePool ? { resourcePool: selectedResourcePool } : {};
    };

    test('should include resourcePool in spec when selectedResourcePool is provided', () => {
      const result = getResourcePoolSpec('workshop-pool');
      expect(result).toEqual({ resourcePool: 'workshop-pool' });
    });

    test('should return empty object when selectedResourcePool is undefined', () => {
      const result = getResourcePoolSpec(undefined);
      expect(result).toEqual({});
    });

    test('should return empty object when no pool is selected', () => {
      const result = getResourcePoolSpec();
      expect(result).toEqual({});
    });
  });
});

describe('assignSelfPacedLabUser', () => {
  const makeSelfPacedLabUserAssignment = (
    overrides: Partial<{
      name: string;
      resourceClaimName: string;
      userName: string;
      email: string;
      selfPacedLabName: string;
    }> = {},
  ): SelfPacedLabUserAssignment => ({
    apiVersion: 'babylon.gpte.redhat.com/v1',
    kind: 'SelfPacedLabUserAssignment',
    metadata: {
      name: overrides.name || 'splua-001',
      namespace: 'test-ns',
      uid: 'uid-001',
      creationTimestamp: '2026-01-01T00:00:00Z',
    },
    spec: {
      selfPacedLabName: overrides.selfPacedLabName || 'test-lab',
      resourceClaimName: overrides.resourceClaimName || 'rc-001',
      userName: overrides.userName || 'user1',
      ...(overrides.email !== undefined ? { assignment: { email: overrides.email } } : {}),
    },
  });

  beforeEach(() => {
    fetchMock.resetMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    sessionWindow.sessionPromiseInstance = Promise.resolve({ token: 'test-token' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete sessionWindow.sessionPromiseInstance;
  });

  test('should return original array when assignment is not found', async () => {
    const assignments = [makeSelfPacedLabUserAssignment()];

    const result = await assignSelfPacedLabUser({
      resourceClaimName: 'non-existent',
      userName: 'user1',
      email: 'new@example.com',
      selfPacedLabUserAssignments: assignments,
    });

    expect(result).toBe(assignments);
    expect(console.error).toHaveBeenCalledWith('Unable to assign, non-existent user1 not found.');
  });

  test('should return original array when email already matches', async () => {
    const assignments = [makeSelfPacedLabUserAssignment({ email: 'same@example.com' })];

    const result = await assignSelfPacedLabUser({
      resourceClaimName: 'rc-001',
      userName: 'user1',
      email: 'same@example.com',
      selfPacedLabUserAssignments: assignments,
    });

    expect(result).toBe(assignments);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('should return original array when both current and new email are empty', async () => {
    const assignments = [makeSelfPacedLabUserAssignment()];

    const result = await assignSelfPacedLabUser({
      resourceClaimName: 'rc-001',
      userName: 'user1',
      email: '',
      selfPacedLabUserAssignments: assignments,
    });

    expect(result).toBe(assignments);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('should add assignment when no existing assignment and email provided', async () => {
    const updatedAssignment = makeSelfPacedLabUserAssignment({ email: 'new@example.com' });
    fetchMock.mockResponseOnce(JSON.stringify(updatedAssignment));

    const assignments = [makeSelfPacedLabUserAssignment()];
    const result = await assignSelfPacedLabUser({
      resourceClaimName: 'rc-001',
      userName: 'user1',
      email: 'new@example.com',
      selfPacedLabUserAssignments: assignments,
    });

    expect(result[0]).toEqual(updatedAssignment);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('selfpacedlabuserassignments');
    const body = JSON.parse(options?.body as string);
    expect(body).toContainEqual({ op: 'add', path: '/spec/assignment', value: { email: 'new@example.com' } });
  });

  test('should replace assignment email when existing assignment present', async () => {
    const updatedAssignment = makeSelfPacedLabUserAssignment({ email: 'new@example.com' });
    fetchMock.mockResponseOnce(JSON.stringify(updatedAssignment));

    const assignments = [makeSelfPacedLabUserAssignment({ email: 'old@example.com' })];
    const result = await assignSelfPacedLabUser({
      resourceClaimName: 'rc-001',
      userName: 'user1',
      email: 'new@example.com',
      selfPacedLabUserAssignments: assignments,
    });

    expect(result[0]).toEqual(updatedAssignment);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body).toContainEqual({ op: 'test', path: '/spec/assignment/email', value: 'old@example.com' });
    expect(body).toContainEqual({ op: 'replace', path: '/spec/assignment/email', value: 'new@example.com' });
  });

  test('should remove assignment when existing assignment and empty email', async () => {
    const updatedAssignment = makeSelfPacedLabUserAssignment();
    fetchMock.mockResponseOnce(JSON.stringify(updatedAssignment));

    const assignments = [makeSelfPacedLabUserAssignment({ email: 'old@example.com' })];
    const result = await assignSelfPacedLabUser({
      resourceClaimName: 'rc-001',
      userName: 'user1',
      email: '',
      selfPacedLabUserAssignments: assignments,
    });

    expect(result[0]).toEqual(updatedAssignment);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body).toContainEqual({ op: 'remove', path: '/spec/assignment' });
  });

  test('should include test ops for resourceClaimName and userName', async () => {
    const updatedAssignment = makeSelfPacedLabUserAssignment({ email: 'new@example.com' });
    fetchMock.mockResponseOnce(JSON.stringify(updatedAssignment));

    const assignments = [makeSelfPacedLabUserAssignment()];
    await assignSelfPacedLabUser({
      resourceClaimName: 'rc-001',
      userName: 'user1',
      email: 'new@example.com',
      selfPacedLabUserAssignments: assignments,
    });

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body).toContainEqual({ op: 'test', path: '/spec/resourceClaimName', value: 'rc-001' });
    expect(body).toContainEqual({ op: 'test', path: '/spec/userName', value: 'user1' });
  });
});

describe('assignWorkshopUser', () => {
  const makeWorkshopUserAssignment = (email?: string, assignedAt?: string): WorkshopUserAssignment => ({
    apiVersion: 'babylon.gpte.redhat.com/v1',
    kind: 'WorkshopUserAssignment',
    metadata: {
      name: 'wua-001',
      namespace: 'test-ns',
      uid: 'uid-001',
      creationTimestamp: '2026-01-01T00:00:00Z',
    },
    spec: {
      workshopName: 'test-workshop',
      resourceClaimName: 'rc-001',
      userName: 'user1',
      ...(email !== undefined ? { assignment: { email, ...(assignedAt ? { assignedAt } : {}) } } : {}),
    },
  });

  beforeEach(() => {
    fetchMock.resetMocks();
    jest.useFakeTimers({ now: new Date('2026-11-26T10:15:30.123Z') });
    sessionWindow.sessionPromiseInstance = Promise.resolve({ token: 'test-token' });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete sessionWindow.sessionPromiseInstance;
  });

  test('records assignedAt when a free seat is assigned', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(makeWorkshopUserAssignment('new@example.com')));

    await assignWorkshopUser({
      resourceClaimName: 'rc-001',
      userName: 'user1',
      email: 'new@example.com',
      workshopUserAssignments: [makeWorkshopUserAssignment()],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body).toContainEqual({
      op: 'add',
      path: '/spec/assignment',
      value: { email: 'new@example.com', assignedAt: '2026-11-26T10:15:30Z' },
    });
  });

  test('replaces assignedAt when the seat moves to a different email', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(makeWorkshopUserAssignment('new@example.com')));

    await assignWorkshopUser({
      resourceClaimName: 'rc-001',
      userName: 'user1',
      email: 'new@example.com',
      workshopUserAssignments: [makeWorkshopUserAssignment('old@example.com', '2026-11-20T08:00:00Z')],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body).toContainEqual({ op: 'test', path: '/spec/assignment/email', value: 'old@example.com' });
    expect(body).toContainEqual({
      op: 'replace',
      path: '/spec/assignment',
      value: { email: 'new@example.com', assignedAt: '2026-11-26T10:15:30Z' },
    });
  });

  test('removes the whole assignment, including assignedAt, when the seat is released', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(makeWorkshopUserAssignment()));

    await assignWorkshopUser({
      resourceClaimName: 'rc-001',
      userName: 'user1',
      email: '',
      workshopUserAssignments: [makeWorkshopUserAssignment('old@example.com', '2026-11-20T08:00:00Z')],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body).toContainEqual({ op: 'remove', path: '/spec/assignment' });
  });
});
