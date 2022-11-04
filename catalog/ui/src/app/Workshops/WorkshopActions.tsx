import React from 'react';
import { DropdownPosition } from '@patternfly/react-core';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';

const WorkshopActions: React.FC<{
  actionHandlers: {
    delete: () => void;
    deleteService?: () => void | null;
    start?: () => void | null;
    stop?: () => void | null;
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
        label="Delete Selected Services"
        onSelect={actionHandlers.deleteService}
      />
    );
  actionHandlers.start &&
    actionDropdownItems.push(
      <ActionDropdownItem
        key="startServices"
        isDisabled={!actionHandlers.start}
        label="Start Services"
        onSelect={actionHandlers.start}
      />
    );
  actionHandlers.stop &&
    actionDropdownItems.push(
      <ActionDropdownItem
        key="stopServices"
        isDisabled={!actionHandlers.stop}
        label="Stop Services"
        onSelect={actionHandlers.stop}
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
