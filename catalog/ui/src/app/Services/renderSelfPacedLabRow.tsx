import React from 'react';
import type { SelfPacedLabWithResourceClaims, ServiceActionActions } from '@app/types';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import { displayName, getStageFromK8sObject } from '@app/util';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import TimeInterval from '@app/components/TimeInterval';
import { Link } from 'react-router-dom';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import Label from '@app/components/Label';
import SelfPacedLabStatus from '@app/components/SelfPacedLabStatus';
import ScheduledStatus from '@app/components/ScheduledStatus';
import { getResourceClaimClusters } from './service-utils';

const renderSelfPacedLabRow = ({
  selfPacedLab,
  showModal,
  isAdmin,
}: {
  selfPacedLab: SelfPacedLabWithResourceClaims;
  showModal: ({
    modal,
    action,
    selfPacedLab,
  }: {
    modal: string;
    action?: ServiceActionActions;
    selfPacedLab?: SelfPacedLabWithResourceClaims;
  }) => void;
  isAdmin: boolean;
}) => {
  const actionHandlers = {
    delete: () => showModal({ modal: 'action', action: 'delete', selfPacedLab }),
    lifespan: () => showModal({ action: 'retirement', modal: 'scheduleAction', selfPacedLab }),
  };
  const stage = getStageFromK8sObject(selfPacedLab);
  const autoStartTime = selfPacedLab.spec.lifespan?.start ? Date.parse(selfPacedLab.spec.lifespan.start) : null;
  const autoDestroyTime = selfPacedLab.spec.lifespan?.end ? Date.parse(selfPacedLab.spec.lifespan.end) : null;

  const poolCount = selfPacedLab.status?.poolCount;
  const clusters = getResourceClaimClusters(selfPacedLab.resourceClaims);

  const nameCell = (
    <div key="selfpacedlab-name-cell" className="services-list__name">
      <Link
        key="selfpacedlab-name"
        to={`/selfpacedlabs/${selfPacedLab.metadata.namespace}/${selfPacedLab.metadata.name}`}
      >
        {displayName(selfPacedLab)}
      </Link>
      {selfPacedLab.isCollaborator ? (
        <Label key="selfpacedlab-name__collaborator" tooltipDescription={<div>You have been granted access to this self-paced lab as a collaborator</div>}>
          Shared Service
        </Label>
      ) : null}
      {stage !== 'prod' ? <Label key="selfpacedlab-name__stage">{stage}</Label> : null}
      <Label key="selfpacedlab-name__type" tooltipDescription={<div>Self-paced lab with warm pool of pre-provisioned instances</div>}>
        Self-Paced Lab
      </Label>
      {isAdmin ? <OpenshiftConsoleLink key="selfpacedlab-name__console" resource={selfPacedLab} /> : null}
    </div>
  );
  const guidCell = <span key="selfpacedlab-guid">-</span>;
  const clusterCell = <span key="selfpacedlab-cluster">{clusters.join(', ') || '-'}</span>;
  const statusCell = autoStartTime && autoStartTime > Date.now() ? (
    <ScheduledStatus key="scheduled" startTime={autoStartTime} />
  ) : poolCount ? (
    <SelfPacedLabStatus key="selfpacedlab-status" poolCount={poolCount} />
  ) : (
    <span key="selfpacedlab-status">Initializing...</span>
  );
  const createdAtCell = (
    <>
      <TimeInterval key="interval" toTimestamp={selfPacedLab.metadata.creationTimestamp} />
    </>
  );
  const autoStopCell = <span key="selfpacedlab-autostop">-</span>;
  const autoDestroyCell = (
    <>
      <AutoStopDestroy
        type="auto-destroy"
        onClick={actionHandlers.lifespan}
        time={autoDestroyTime}
        isDisabled={!showModal}
        notDefinedMessage="- Not defined -"
        key="selfpacedlab-auto-destroy"
      />
    </>
  );
  const actionsCell = (
    <React.Fragment key="selfpacedlab-actions">
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 'var(--pf-t--global--spacer--sm)',
        }}
      >
        <ButtonCircleIcon
          key="actions__delete"
          onClick={actionHandlers.delete}
          description="Delete"
          icon={TrashIcon}
          isDisabled={selfPacedLab.isCollaborator}
        />
      </div>
    </React.Fragment>
  );

  return {
    cells: isAdmin
      ? [nameCell, guidCell, clusterCell, statusCell, createdAtCell, autoStopCell, autoDestroyCell, actionsCell]
      : [nameCell, statusCell, createdAtCell, autoStopCell, autoDestroyCell, actionsCell],
  };
};

export default renderSelfPacedLabRow;
