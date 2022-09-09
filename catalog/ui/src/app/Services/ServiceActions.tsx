import React from 'react';
import { DropdownPosition } from '@patternfly/react-core';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import { checkResourceClaimCanStart, checkResourceClaimCanStop } from '@app/util';
import { EllipsisVIcon } from '@patternfly/react-icons';

const ServiceActions: React.FC<{
  actionHandlers: any;
  className?: string;
  isDisabled?: boolean;
  position?: DropdownPosition | 'right' | 'left';
  resourceClaim?: any;
  serviceName?: string;
  iconOnly?: boolean;
}> = ({ actionHandlers, className, isDisabled, position, resourceClaim, serviceName, iconOnly = false }) => {
  const actionDropdownItems: any[] = [];
  const isPartOfWorkshop = resourceClaim?.metadata?.labels?.[`babylon.gpte.redhat.com/workshop-provision`];
  const canStart = resourceClaim ? checkResourceClaimCanStart(resourceClaim) : true;
  const canStop = resourceClaim ? checkResourceClaimCanStop(resourceClaim) : true;

  if (!isPartOfWorkshop && actionHandlers.runtime) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="runtime"
        label="Edit Auto-Stop"
        isDisabled={
          !resourceClaim || !canStop || !resourceClaim?.status?.resources?.[0]?.state?.spec?.vars?.action_schedule
        }
        onSelect={actionHandlers.runtime}
      />
    );
  }
  if (!isPartOfWorkshop && actionHandlers.lifespan) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="lifespan"
        label="Edit Auto-Destroy"
        isDisabled={!resourceClaim?.status?.lifespan}
        onSelect={actionHandlers.lifespan}
      />
    );
  }
  if (actionHandlers.delete) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="delete"
        label={serviceName ? `Delete ${serviceName}` : 'Delete'}
        onSelect={actionHandlers.delete}
      />
    );
  }
  if (!isPartOfWorkshop && actionHandlers.start) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="start"
        label={serviceName ? `Start ${serviceName}` : 'Start'}
        isDisabled={!canStart}
        onSelect={actionHandlers.start}
      />
    );
  }
  if (!isPartOfWorkshop && actionHandlers.stop) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="stop"
        label={serviceName ? `Stop ${serviceName}` : 'Stop'}
        isDisabled={!canStop}
        onSelect={actionHandlers.stop}
      />
    );
  }

  if (actionHandlers.getCost) {
    actionDropdownItems.push(
      <ActionDropdownItem key="getCost" label="Get amount spent" onSelect={actionHandlers.getCost} />
    );
  }
  return (
    <ActionDropdown
      actionDropdownItems={actionDropdownItems}
      className={className}
      isDisabled={isDisabled}
      position={position}
      icon={iconOnly ? EllipsisVIcon : null}
      isPlain={iconOnly ? true : false}
    />
  );
};

export default ServiceActions;
