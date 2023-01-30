import React from 'react';
import { DropdownPosition } from '@patternfly/react-core';
import EllipsisVIcon from '@patternfly/react-icons/dist/js/icons/ellipsis-v-icon';
import { ResourceClaim } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import {
  BABYLON_DOMAIN,
  checkResourceClaimCanRate,
  checkResourceClaimCanStart,
  checkResourceClaimCanStop,
} from '@app/util';

const ServiceActions: React.FC<{
  actionHandlers: {
    runtime?: () => void;
    lifespan?: () => void;
    delete: () => void;
    start?: () => void;
    stop?: () => void;
    manageWorkshop?: () => void;
    getCost?: () => void;
    rate?: () => void;
  };
  className?: string;
  isDisabled?: boolean;
  position?: DropdownPosition | 'right' | 'left';
  resourceClaim?: ResourceClaim;
  serviceName?: string;
  iconOnly?: boolean;
}> = ({ actionHandlers, className, isDisabled, position, resourceClaim, serviceName, iconOnly = false }) => {
  const actionDropdownItems: JSX.Element[] = [];
  const workshopProvisionName = resourceClaim?.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop-provision`];
  const isPartOfWorkshop = !!workshopProvisionName;
  const canStart = resourceClaim ? checkResourceClaimCanStart(resourceClaim) : false;
  const canStop = resourceClaim ? checkResourceClaimCanStop(resourceClaim) : false;
  const canRate = resourceClaim ? checkResourceClaimCanRate(resourceClaim) : false;

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

  if (actionHandlers.manageWorkshop) {
    actionDropdownItems.push(
      <ActionDropdownItem key="manageWorkshop" label="Manage Workshop" onSelect={actionHandlers.manageWorkshop} />
    );
  }
  if (!isPartOfWorkshop && actionHandlers.rate) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="rate"
        label="Rate"
        onSelect={actionHandlers.rate}
        isDisabled={!canRate}
        className="action-dropdown-item__rate"
      />
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
