import type { WorkshopUserAssignment } from '@app/types';
import { getUserSeatsLabel } from './WorkshopsItemUserAssignments';

jest.mock('@app/api', () => ({
  assignWorkshopUser: jest.fn(),
  bulkAssignWorkshopUsers: jest.fn(),
}));

const makeUserAssignment = (userName: string, email?: string): WorkshopUserAssignment =>
  ({
    apiVersion: 'babylon.gpte.redhat.com/v1',
    kind: 'WorkshopUserAssignment',
    metadata: { name: `ua-${userName}`, namespace: 'test-ns' },
    spec: {
      workshopName: 'test-workshop',
      resourceClaimName: 'rc-1',
      userName,
      ...(email ? { assignment: { email } } : {}),
    },
  }) as unknown as WorkshopUserAssignment;

describe('getUserSeatsLabel', () => {
  test('shows assigned/total seats', () => {
    expect(
      getUserSeatsLabel([
        makeUserAssignment('user1', 'a@example.com'),
        makeUserAssignment('user2'),
        makeUserAssignment('user3', 'b@example.com'),
      ]),
    ).toBe('Users (2/3)');
  });

  test('does not count assignments with an empty email', () => {
    expect(getUserSeatsLabel([makeUserAssignment('user1', ''), makeUserAssignment('user2')])).toBe('Users (0/2)');
  });

  test('falls back to plain label when there are no seats or data is not loaded', () => {
    expect(getUserSeatsLabel([])).toBe('Users');
    expect(getUserSeatsLabel(undefined)).toBe('Users');
  });
});
