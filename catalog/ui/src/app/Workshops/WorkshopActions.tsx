import React from 'react';
import { DropdownPosition } from '@patternfly/react-core';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';

const WorkshopActions: React.FC<{
  actionHandlers: {
    delete: () => void;
    deleteService?: () => void | null;
    startService?: () => void | null;
    stopService?: () => void | null;
  };
  className?: string;
  isDisabled?: boolean;
  position?: DropdownPosition | 'right' | 'left';
  workshopName?: string;
}> = ({ actionHandlers, className, isDisabled, position, workshopName }) => {
  const actionDropdownItems = [
    <ActionDropdownItem
      key="delete"
      isDisabled={!actionHandlers.delete}
      label={workshopName ? `Delete ${workshopName}` : 'Delete'}
      onSelect={actionHandlers.delete}
    />,
  ];
  actionHandlers.deleteService &&
    actionDropdownItems.push(
      <ActionDropdownItem
        key="deleteServices"
        isDisabled={!actionHandlers.deleteService}
        label={`Delete Selected Services`}
        onSelect={actionHandlers.deleteService}
      />
    );
  actionHandlers.startService &&
    actionDropdownItems.push(
      <ActionDropdownItem
        key="startServices"
        isDisabled={!actionHandlers.startService}
        label={`Start Selected Services`}
        onSelect={actionHandlers.startService}
      />
    );
  actionHandlers.stopService &&
    actionDropdownItems.push(
      <ActionDropdownItem
        key="stopServices"
        isDisabled={!actionHandlers.stopService}
        label={`Stop Selected Services`}
        onSelect={actionHandlers.stopService}
      />
    );

  return (
    <ActionDropdown
      actionDropdownItems={actionDropdownItems}
      className={className}
      isDisabled={isDisabled}
      position={position}
    />
  );
};

export default WorkshopActions;
