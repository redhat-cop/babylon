import * as React from 'react';

import {
  ActionDropdown,
  ActionDropdownItem,
} from '@app/components/ActionDropdown';

import {
  checkResourceClaimCanStart,
  checkResourceClaimCanStop,
} from '@app/util';

export interface ServiceActionsProps {
  actionHandlers: object;
  className?: string;
  isDisabled?: boolean;
  position?: string;
  resourceClaim: object;
  serviceName?: string;
}

const ServiceActions: React.FunctionComponent<ServiceActionProps> = ({
  actionHandlers,
  className,
  isDisabled,
  position,
  resourceClaim,
  serviceName,
}) => {
  const actionDropdownItems = []
  const canStart = resourceClaim ? checkResourceClaimCanStart(resourceClaim) : true;
  const canStop = resourceClaim ? checkResourceClaimCanStop(resourceClaim) : true;

  if (actionHandlers.lifespan) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="lifespan"
        label="Adjust Lifespan"
        isDisabled={!resourceClaim?.status?.lifespan}
        onSelect={() => actionHandlers.lifespan()}
      />
    );
  }
  if (actionHandlers.runtime) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="runtime"
        label="Adjust Runtime"
        isDisabled={!resourceClaim || !canStop || !resourceClaim?.status?.resources?.[0]?.state?.spec?.vars?.action_schedule}
        onSelect={() => actionHandlers.runtime()}
      />
    );
  }
  if (actionHandlers.delete) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="delete"
        label={serviceName ? `Delete ${serviceName}` : "Delete"}
        onSelect={() => actionHandlers.delete()}
      />
    );
  }
  if (actionHandlers.start) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="start"
        label={serviceName ? `Start ${serviceName}` : "Start"}
        isDisabled={!canStart}
        onSelect={() => actionHandlers.start()}
      />
    );
  }
  if (actionHandlers.stop) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="stop"
        label={serviceName ? `Stop ${serviceName}` : "Stop"}
        isDisabled={!canStop}
        onSelect={() => actionHandlers.stop()}
      />
    );
  }
  return (
    <ActionDropdown
      actionDropdownItems={actionDropdownItems}
      className={className}
      isDisabled={isDisabled}
      position={position}
    />
  );
}

export { ServiceActions };
