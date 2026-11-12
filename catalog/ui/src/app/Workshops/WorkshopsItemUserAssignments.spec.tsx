import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WorkshopUserAssignment } from '@app/types';
import WorkshopsItemUserAssignments from './WorkshopsItemUserAssignments';

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

const renderComponent = (userAssignments: WorkshopUserAssignment[]) =>
  render(
    <MemoryRouter>
      <WorkshopsItemUserAssignments userAssignments={userAssignments} onUserAssignmentsUpdate={jest.fn()} />
    </MemoryRouter>,
  );

describe('WorkshopsItemUserAssignments', () => {
  test('shows assigned / total seats summary', () => {
    renderComponent([
      makeUserAssignment('user1', 'a@example.com'),
      makeUserAssignment('user2'),
      makeUserAssignment('user3', 'b@example.com'),
    ]);
    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.getByTestId('users-seats-assigned')).toHaveTextContent('2 / 3');
  });

  test('updates summary when assignments change', () => {
    const { rerender } = renderComponent([makeUserAssignment('user1'), makeUserAssignment('user2')]);
    expect(screen.getByTestId('users-seats-assigned')).toHaveTextContent('0 / 2');
    rerender(
      <MemoryRouter>
        <WorkshopsItemUserAssignments
          userAssignments={[makeUserAssignment('user1', 'a@example.com'), makeUserAssignment('user2')]}
          onUserAssignmentsUpdate={jest.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('users-seats-assigned')).toHaveTextContent('1 / 2');
  });
});
