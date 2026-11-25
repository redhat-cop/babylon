import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WorkshopUserAssignment } from '@app/types';
import WorkshopsItemUserAssignments, { getUserSeatsLabel } from './WorkshopsItemUserAssignments';

jest.mock('@app/api', () => ({
  assignWorkshopUser: jest.fn(),
  bulkAssignWorkshopUsers: jest.fn(),
}));

const makeUserAssignment = (userName: string, email?: string, assignedAt?: string): WorkshopUserAssignment =>
  ({
    apiVersion: 'babylon.gpte.redhat.com/v1',
    kind: 'WorkshopUserAssignment',
    metadata: { name: `ua-${userName}`, namespace: 'test-ns', uid: `uid-${userName}` },
    spec: {
      workshopName: 'test-workshop',
      resourceClaimName: 'rc-1',
      userName,
      ...(email ? { assignment: { email, ...(assignedAt ? { assignedAt } : {}) } } : {}),
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

describe('WorkshopsItemUserAssignments claim time', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-26T10:12:00Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const renderTable = (userAssignments: WorkshopUserAssignment[]) =>
    render(
      <MemoryRouter>
        <WorkshopsItemUserAssignments userAssignments={userAssignments} onUserAssignmentsUpdate={jest.fn()} />
      </MemoryRouter>,
    );

  test('shows when the seat was claimed, with relative time', () => {
    renderTable([makeUserAssignment('user1', 'a@example.com', '2026-11-26T10:00:00Z')]);
    expect(screen.getByText(/Claimed/)).toBeInTheDocument();
    expect(screen.getByText('12 minutes ago')).toBeInTheDocument();
  });

  test('shows nothing for seats without a recorded claim time or without an assignee', () => {
    renderTable([makeUserAssignment('user1', 'a@example.com'), makeUserAssignment('user2')]);
    expect(screen.queryByText(/Claimed/)).not.toBeInTheDocument();
  });
});
