import React from 'react';
import { ServiceActionActions, Workshop, WorkshopWithResourceClaims } from '@app/types';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import { displayName, getStageFromK8sObject } from '@app/util';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import TimeInterval from '@app/components/TimeInterval';
import { Link } from 'react-router-dom';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import {
  checkWorkshopCanStart,
  checkWorkshopCanStop,
  getWorkshopAutoStopTime,
  getWorkshopLifespan,
  isWorkshopLocked,
} from '@app/Workshops/workshops-utils';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import Label from '@app/components/Label';
import PlayIcon from '@patternfly/react-icons/dist/js/icons/play-icon';
import StopIcon from '@patternfly/react-icons/dist/js/icons/stop-icon';
import ServiceStatus from './ServiceStatus';
import { getMostRelevantResourceAndTemplate } from './service-utils';

const renderWorkshopRow = ({
  workshop,
  showModal,
  isAdmin,
}: {
  workshop: WorkshopWithResourceClaims;
  showModal: ({
    modal,
    action,
    workshop,
  }: {
    modal: string;
    action?: ServiceActionActions;
    workshop?: Workshop;
  }) => void;
  isAdmin: boolean;
}) => {
  const isLocked = isWorkshopLocked(workshop, isAdmin);
  const actionHandlers = {
    delete: () => showModal({ modal: 'action', action: 'delete', workshop }),
    lifespan: () => showModal({ action: 'retirement', modal: 'scheduleAction', workshop }),
    runtime: null,
    start: null,
    stop: null,
  };
  const resources = workshop.resourceClaims
    ? workshop.resourceClaims.flatMap((r) => r.status?.resources || []).map((r) => r.state)
    : [];
  if (resources.find((r) => r?.kind === 'AnarchySubject')) {
    actionHandlers['runtime'] = () => showModal({ action: 'stop', modal: 'scheduleAction', workshop });
    actionHandlers['start'] = () => showModal({ action: 'start', modal: 'action', workshop });
    actionHandlers['stop'] = () => showModal({ action: 'stop', modal: 'action', workshop });
  }
  const ownerReference = workshop.metadata?.ownerReferences?.[0];
  const owningResourceClaimName =
    ownerReference && ownerReference.kind === 'ResourceClaim' ? ownerReference.name : null;
  const { start: autoStartTime, end: autoDestroyTime } = getWorkshopLifespan(workshop, null);
  const autoStopTime = getWorkshopAutoStopTime(workshop, workshop.resourceClaims);
  const stage = getStageFromK8sObject(workshop);

  // Add columns
  const nameCell = (
    <>
      <Link
        key="workshop-name"
        to={
          owningResourceClaimName
            ? `/services/${workshop.metadata.namespace}/${owningResourceClaimName}/workshop`
            : `/workshops/${workshop.metadata.namespace}/${workshop.metadata.name}`
        }
      >
        {displayName(workshop)}
      </Link>
      {stage !== 'prod' ? <Label key="workshop-name__stage">{stage}</Label> : null}
      <Label key="workshop-name__ui" tooltipDescription={<div>Workshop user interface is enabled</div>}>
        Workshop UI
      </Label>
      {isAdmin ? <OpenshiftConsoleLink key="workshop-name__console" resource={workshop} /> : null}
    </>
  );
  const guidCell = <span key="workshop-guid">-</span>;
  const statusCell = (
    <>
      {workshop.resourceClaims && workshop.resourceClaims.length > 0 ? (
        <ServiceStatus
          creationTime={Date.parse(workshop.resourceClaims[0].metadata.creationTimestamp)}
          resource={getMostRelevantResourceAndTemplate(workshop.resourceClaims[0]).resource}
          resourceTemplate={getMostRelevantResourceAndTemplate(workshop.resourceClaims[0]).template}
          resourceClaim={workshop.resourceClaims[0]}
          summary={workshop.resourceClaims[0].status?.summary}
        />
      ) : autoStartTime && autoStartTime > Date.now() ? (
        <span className="services-item__status--scheduled" key="scheduled">
          <CheckCircleIcon key="scheduled-icon" /> Scheduled
        </span>
      ) : (
        <p>...</p>
      )}
    </>
  );

  const createdAtCell = (
    <>
      <TimeInterval key="interval" toTimestamp={workshop.metadata.creationTimestamp} />
    </>
  );
  const autoStopCell = (
    <>
      <AutoStopDestroy
        type="auto-stop"
        onClick={actionHandlers.runtime}
        isDisabled={isLocked || !showModal || !checkWorkshopCanStop(workshop.resourceClaims)}
        time={autoStopTime}
        destroyTimestamp={autoDestroyTime}
        key="workshop-auto-stop"
      />
    </>
  );
  const autoDestroyCell = (
    <>
      <AutoStopDestroy
        type="auto-destroy"
        onClick={actionHandlers.lifespan}
        time={autoDestroyTime}
        isDisabled={isLocked || !showModal}
        notDefinedMessage="- Not defined -"
        key="workshop-auto-destroy"
      />
    </>
  );
  const actionsCell = (
    <React.Fragment key="workshop-actions">
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 'var(--pf-v5-global--spacer--sm)',
        }}
      >
        <ButtonCircleIcon
          isDisabled={!checkWorkshopCanStart(workshop.resourceClaims)}
          onClick={actionHandlers.start}
          description="Start"
          icon={PlayIcon}
          key="actions__start"
        />
        <ButtonCircleIcon
          isDisabled={isLocked || !checkWorkshopCanStop(workshop.resourceClaims)}
          onClick={actionHandlers.stop}
          description="Stop"
          icon={StopIcon}
          key="actions__stop"
        />
        <ButtonCircleIcon
          key="actions__delete"
          isDisabled={isLocked}
          onClick={actionHandlers.delete}
          description="Delete"
          icon={TrashIcon}
        />
      </div>
    </React.Fragment>
  );

  return {
    cells: isAdmin
      ? [nameCell, guidCell, statusCell, createdAtCell, autoStopCell, autoDestroyCell, actionsCell]
      : [nameCell, statusCell, createdAtCell, autoStopCell, autoDestroyCell, actionsCell],
  };
};

export default renderWorkshopRow;
