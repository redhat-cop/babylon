import React from 'react';
import { render, waitFor, screen, fireEvent } from '@testing-library/react';
import WorkshopActions from './WorkshopActions';

describe('WorkshopActions', () => {
  test('When WorkshopActions renders, should display Actions button', async () => {
    const deleteHandler = jest.fn();

    const { getByText } = render(
      <WorkshopActions
        workshopName="Test Workshop"
        actionHandlers={{
          delete: deleteHandler,
        }}
      />
    );
    const testVar = getByText('Actions');
    await waitFor(() => expect(testVar).toBeInTheDocument());
  });

  test('When WorkshopActions renders, should display Delete option', async () => {
    const deleteHandler = jest.fn();

    const { getByText } = render(
      <WorkshopActions
        workshopName="Test Workshop"
        actionHandlers={{
          delete: deleteHandler,
        }}
      />
    );
    const button = screen.getByText('Actions');
    fireEvent.click(button);
    await waitFor(() => expect(getByText('Delete Test Workshop')).toBeInTheDocument());
  });

  test('When isLocked is true, Delete should be disabled', async () => {
    const deleteHandler = jest.fn();

    render(
      <WorkshopActions
        workshopName="Test Workshop"
        isLocked={true}
        actionHandlers={{
          delete: deleteHandler,
        }}
      />
    );
    const button = screen.getByText('Actions');
    fireEvent.click(button);
    
    await waitFor(() => {
      const deleteButton = screen.getByText('Delete Test Workshop');
      expect(deleteButton).toBeInTheDocument();
      // PatternFly dropdown items have disabled class on the li element
      expect(deleteButton.closest('li')).toHaveClass('pf-m-disabled');
    });
  });

  test('When canManageCollaborators is false, Delete should be disabled', async () => {
    const deleteHandler = jest.fn();

    render(
      <WorkshopActions
        workshopName="Test Workshop"
        canManageCollaborators={false}
        actionHandlers={{
          delete: deleteHandler,
        }}
      />
    );
    const button = screen.getByText('Actions');
    fireEvent.click(button);
    
    await waitFor(() => {
      const deleteButton = screen.getByText('Delete Test Workshop');
      expect(deleteButton).toBeInTheDocument();
      // PatternFly dropdown items have disabled class on the li element
      expect(deleteButton.closest('li')).toHaveClass('pf-m-disabled');
    });
  });

  test('When canManageCollaborators is true (default), Delete should be enabled', async () => {
    const deleteHandler = jest.fn();

    render(
      <WorkshopActions
        workshopName="Test Workshop"
        canManageCollaborators={true}
        actionHandlers={{
          delete: deleteHandler,
        }}
      />
    );
    const button = screen.getByText('Actions');
    fireEvent.click(button);
    
    await waitFor(() => {
      const deleteButton = screen.getByText('Delete Test Workshop');
      expect(deleteButton).toBeInTheDocument();
      // PatternFly dropdown items should NOT have disabled class when enabled
      expect(deleteButton.closest('li')).not.toHaveClass('pf-m-disabled');
    });
  });

  test('When canManageCollaborators is false, clicking Delete should not call handler', async () => {
    const deleteHandler = jest.fn();

    render(
      <WorkshopActions
        workshopName="Test Workshop"
        canManageCollaborators={false}
        actionHandlers={{
          delete: deleteHandler,
        }}
      />
    );
    const button = screen.getByText('Actions');
    fireEvent.click(button);
    
    await waitFor(() => {
      const deleteButton = screen.getByText('Delete Test Workshop');
      fireEvent.click(deleteButton);
    });
    
    expect(deleteHandler).not.toHaveBeenCalled();
  });

  test('When canManageCollaborators is false, Delete Selected Services should still be enabled (collaborators can delete services)', async () => {
    const deleteHandler = jest.fn();
    const deleteServiceHandler = jest.fn();

    render(
      <WorkshopActions
        workshopName="Test Workshop"
        canManageCollaborators={false}
        actionHandlers={{
          delete: deleteHandler,
          deleteService: deleteServiceHandler,
        }}
      />
    );
    const button = screen.getByText('Actions');
    fireEvent.click(button);
    
    await waitFor(() => {
      const deleteServiceButton = screen.getByText('Delete Selected Services');
      expect(deleteServiceButton).toBeInTheDocument();
      // Collaborators CAN delete selected services, so this should NOT be disabled
      expect(deleteServiceButton.closest('li')).not.toHaveClass('pf-m-disabled');
    });
  });
});
