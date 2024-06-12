import React from 'react';
import { ResourceClaim, ServiceActionActions } from '@app/types';
import StopIcon from '@patternfly/react-icons/dist/js/icons/stop-icon';
import PlayIcon from '@patternfly/react-icons/dist/js/icons/play-icon';
import DollarSignIcon from '@patternfly/react-icons/dist/js/icons/dollar-sign-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import CogIcon from '@patternfly/react-icons/dist/js/icons/cog-icon';
import {
  BABYLON_DOMAIN,
  checkResourceClaimCanStart,
  checkResourceClaimCanStop,
  displayName,
  getCostTracker,
  getStageFromK8sObject,
  isResourceClaimPartOfWorkshop,
} from '@app/util';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import { getAutoStopTime, getMostRelevantResourceAndTemplate } from './service-utils';
import ServiceStatus from './ServiceStatus';
import TimeInterval from '@app/components/TimeInterval';
import LabInterfaceLink from '@app/components/LabInterfaceLink';
import { Link } from 'react-router-dom';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import Label from '@app/components/Label';

const renderResourceClaimRow = ({
  resourceClaim,
  showModal,
  isAdmin,
  navigate,
}: {
  resourceClaim: ResourceClaim;
  showModal: ({
    modal,
    action,
    resourceClaim,
  }: {
    modal: string;
    action?: ServiceActionActions;
    resourceClaim?: ResourceClaim;
  }) => void;
  isAdmin: boolean;
  navigate: (n: string) => void;
}) => {
  const resourceHandle = resourceClaim.status?.resourceHandle;
  const specResources = resourceClaim.spec.resources || [];
  const resources = (resourceClaim.status?.resources || []).map((r) => r.state);
  const guid = resourceHandle?.name ? resourceHandle.name.replace(/^guid-/, '') : null;
  const workshopName = resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop`];
  const isPartOfWorkshop = isResourceClaimPartOfWorkshop(resourceClaim);
  // Find lab user interface information either in the resource claim or inside resources
  // associated with the provisioned service.
  const labUserInterfaceData =
    resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceData`] ||
    resourceClaim?.status?.summary?.provision_data?.lab_ui_data ||
    resourceClaim?.status?.summary?.provision_data?.labUserInterfaceData ||
    resources
      .map((r) =>
        r?.kind === 'AnarchySubject' ? r?.spec?.vars?.provision_data?.lab_ui_data : r?.data?.labUserInterfaceData
      )
      .map((j) => (typeof j === 'string' ? JSON.parse(j) : j))
      .find((u) => u != null);
  const labUserInterfaceMethod =
    resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceMethod`] ||
    resourceClaim?.status?.summary?.provision_data?.lab_ui_method ||
    resourceClaim?.status?.summary?.provision_data?.labUserInterfaceMethod ||
    resources
      .map((r) =>
        r?.kind === 'AnarchySubject' ? r?.spec?.vars?.provision_data?.lab_ui_method : r?.data?.labUserInterfaceMethod
      )
      .find((u) => u != null);
  const labUserInterfaceUrl =
    resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceUrl`] ||
    resourceClaim?.status?.summary?.provision_data?.labUserInterfaceUrl ||
    resourceClaim?.status?.summary?.provision_data?.lab_ui_url ||
    resourceClaim?.status?.summary?.provision_data?.bookbag_url ||
    resources
      .map((r) => {
        const data = r?.kind === 'AnarchySubject' ? r.spec?.vars?.provision_data : r?.data;
        return data?.labUserInterfaceUrl || data?.lab_ui_url || data?.bookbag_url;
      })
      .find((u) => u != null);

  const costTracker = getCostTracker(resourceClaim);
  // Available actions depends on kind of service
  const actionHandlers = {
    delete: () => showModal({ action: 'delete', modal: 'action', resourceClaim }),
    lifespan: () => showModal({ action: 'retirement', modal: 'scheduleAction', resourceClaim }),
    runtime: null,
    start: null,
    stop: null,
    getCost: null,
    manageWorkshop: null,
  };
  if (resources.find((r) => r?.kind === 'AnarchySubject')) {
    actionHandlers['runtime'] = () => showModal({ action: 'stop', modal: 'scheduleAction', resourceClaim });
    actionHandlers['start'] = () => showModal({ action: 'start', modal: 'action', resourceClaim });
    actionHandlers['stop'] = () => showModal({ action: 'stop', modal: 'action', resourceClaim });
  }
  if (costTracker) {
    actionHandlers['getCost'] = () => showModal({ modal: 'getCost', resourceClaim });
  }
  if (isPartOfWorkshop) {
    actionHandlers['manageWorkshop'] = () => navigate(`/workshops/${resourceClaim.metadata.namespace}/${workshopName}`);
  }

  const autoStopTime = getAutoStopTime(resourceClaim);
  const stage = getStageFromK8sObject(resourceClaim);

  const guidCell = (
    // GUID
    <React.Fragment key="guid">
      {guid ? (
        isAdmin && resourceHandle ? (
          [
            <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.name}`}>
              {guid}
            </Link>,
            <OpenshiftConsoleLink key="console" reference={resourceHandle} />,
          ]
        ) : (
          guid
        )
      ) : (
        <p>-</p>
      )}
    </React.Fragment>
  );

  const nameCell = (
    // Name
    <React.Fragment key="resource-claim-name">
      <Link
        key="resource-claim-name__link"
        to={`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`}
      >
        {displayName(resourceClaim)}
      </Link>
      {stage !== 'prod' ? <Label key="resource-claim-name__stage">{stage}</Label> : null}
      {workshopName ? (
        <Label key="workshop-name__ui" tooltipDescription={<div>Workshop user interface is enabled</div>}>
          Workshop UI
        </Label>
      ) : null}
      {isAdmin ? <OpenshiftConsoleLink key="resource-claim-name__console" resource={resourceClaim} /> : null}
    </React.Fragment>
  );
  const statusCell = (
    // Status
    <React.Fragment key="resource-claim-status">
      {specResources.length >= 1 || resourceClaim.status?.summary ? (
        <ServiceStatus
          creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
          resource={getMostRelevantResourceAndTemplate(resourceClaim).resource}
          resourceTemplate={getMostRelevantResourceAndTemplate(resourceClaim).template}
          resourceClaim={resourceClaim}
          summary={resourceClaim.status?.summary}
        />
      ) : (
        <p>...</p>
      )}
    </React.Fragment>
  );
  const createdAtCell = (
    // Created At
    <React.Fragment key="resource-claim-interval">
      <TimeInterval toTimestamp={resourceClaim.metadata.creationTimestamp} />
    </React.Fragment>
  );

  const autoStopCell = (
    // Auto-stop
    <span key="resource-claim-auto-stop">
      <AutoStopDestroy
        time={autoStopTime}
        onClick={actionHandlers.runtime}
        className="services-list__schedule-btn"
        type="auto-stop"
        resourceClaim={resourceClaim}
      />
    </span>
  );

  const autoDestroyCell = (
    // Auto-destroy
    <span key="resource-claim-auto-destroy">
      <AutoStopDestroy
        onClick={actionHandlers.lifespan}
        time={resourceClaim.spec.lifespan?.end || resourceClaim.status?.lifespan?.end}
        className="services-list__schedule-btn"
        type="auto-destroy"
        resourceClaim={resourceClaim}
      />
    </span>
  );

  const actionsCell = (
    // Actions
    <div
      key="resource-claim-actions"
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 'var(--pf-v5-global--spacer--sm)',
      }}
    >
      {!isPartOfWorkshop ? (
        <ButtonCircleIcon
          isDisabled={!checkResourceClaimCanStart(resourceClaim)}
          onClick={actionHandlers.start}
          description="Start"
          icon={PlayIcon}
          key="actions__start"
        />
      ) : null}
      {!isPartOfWorkshop ? (
        <ButtonCircleIcon
          isDisabled={!checkResourceClaimCanStop(resourceClaim)}
          onClick={actionHandlers.stop}
          description="Stop"
          icon={StopIcon}
          key="actions__stop"
        />
      ) : null}
      {isPartOfWorkshop ? (
        <ButtonCircleIcon
          onClick={actionHandlers.manageWorkshop}
          description="Manage Workshop"
          icon={CogIcon}
          key="actions__manage-workshop"
        />
      ) : null}
      <ButtonCircleIcon key="actions__delete" onClick={actionHandlers.delete} description="Delete" icon={TrashIcon} />
      {actionHandlers.getCost ? (
        <ButtonCircleIcon
          key="actions__cost"
          onClick={actionHandlers.getCost}
          description="Get amount spent"
          icon={DollarSignIcon}
        />
      ) : null}
      {
        // Lab Interface
        labUserInterfaceUrl ? (
          <LabInterfaceLink
            key="actions__lab-interface"
            url={labUserInterfaceUrl}
            data={labUserInterfaceData}
            method={labUserInterfaceMethod}
            variant="circle"
          />
        ) : null
      }
    </div>
  );

  return {
    cells: isAdmin
      ? [nameCell, guidCell, statusCell, createdAtCell, autoStopCell, autoDestroyCell, actionsCell]
      : [nameCell, statusCell, createdAtCell, autoStopCell, autoDestroyCell, actionsCell],
  };
};

export default renderResourceClaimRow;
