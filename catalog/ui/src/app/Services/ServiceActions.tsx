import React from 'react';
import EllipsisVIcon from '@patternfly/react-icons/dist/js/icons/ellipsis-v-icon';
import { LockedIcon } from '@patternfly/react-icons';
import { ResourceClaim } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import {
  checkResourceClaimCanRate,
  checkResourceClaimCanStart,
  checkResourceClaimCanStop,
  isResourceClaimPartOfWorkshop,
} from '@app/util';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';

const ServiceActions: React.FC<{
  actionHandlers: {
    runtime?: () => void;
    lifespan?: () => void;
    delete?: () => void;
    start?: () => void;
    stop?: () => void;
    manageWorkshop?: () => void;
    rate?: () => void;
  };
  canManageCollaborators?: boolean;
  className?: string;
  isDisabled?: boolean;
  isLocked?: boolean;
  position?: 'right' | 'left';
  resourceClaim?: ResourceClaim;
  serviceName?: string;
  iconOnly?: boolean;
}> = ({ actionHandlers, canManageCollaborators = true, className, isDisabled, isLocked = false, position, resourceClaim, serviceName, iconOnly = false }) => {
  const actionDropdownItems = [];
  const { ratings_enabled } = useInterfaceConfig();
  const isPartOfWorkshop = isResourceClaimPartOfWorkshop(resourceClaim);
  const canStart = resourceClaim ? checkResourceClaimCanStart(resourceClaim) : false;
  const canStop = resourceClaim ? checkResourceClaimCanStop(resourceClaim) : false;
  const canRate = resourceClaim && ratings_enabled ? checkResourceClaimCanRate(resourceClaim) : false;

  if (!isPartOfWorkshop && actionHandlers.runtime) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="runtime"
        label="Edit Auto-Stop"
        isDisabled={
          isLocked || !resourceClaim || !canStop || !resourceClaim?.status?.resources?.[0]?.state?.spec?.vars?.action_schedule
        }
        onSelect={actionHandlers.runtime}
        icon={isLocked ? <LockedIcon /> : null}
      />,
    );
  }
  if (!isPartOfWorkshop && actionHandlers.lifespan) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="lifespan"
        label="Edit Auto-Destroy"
        isDisabled={isLocked || !resourceClaim?.status?.lifespan}
        onSelect={actionHandlers.lifespan}
        icon={isLocked ? <LockedIcon /> : null}
      />,
    );
  }
  if (actionHandlers.delete) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="delete"
        label={serviceName ? `Delete ${serviceName}` : 'Delete'}
        isDisabled={isLocked || !canManageCollaborators}
        onSelect={actionHandlers.delete}
        icon={isLocked ? <LockedIcon /> : null}
      />,
    );
  }
  if (!isPartOfWorkshop && actionHandlers.start) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="start"
        label={serviceName ? `Start ${serviceName}` : 'Start'}
        isDisabled={isLocked || !canStart}
        onSelect={actionHandlers.start}
        icon={isLocked ? <LockedIcon /> : null}
      />,
    );
  }
  if (!isPartOfWorkshop && actionHandlers.stop) {
    actionDropdownItems.push(
      <ActionDropdownItem
        key="stop"
        label={serviceName ? `Stop ${serviceName}` : 'Stop'}
        isDisabled={isLocked || !canStop}
        onSelect={actionHandlers.stop}
        icon={isLocked ? <LockedIcon /> : null}
      />,
    );
  }

  if (actionHandlers.manageWorkshop) {
    actionDropdownItems.push(
      <ActionDropdownItem key="manageWorkshop" label="Manage Workshop" onSelect={actionHandlers.manageWorkshop} />,
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
      />,
    );
  }
  return (
    <ActionDropdown
      actionDropdownItems={actionDropdownItems}
      className={className}
      isDisabled={isDisabled}
      icon={iconOnly ? EllipsisVIcon : null}
      isPlain={iconOnly ? true : false}
      position={position}
    />
  );
};

export default ServiceActions;
