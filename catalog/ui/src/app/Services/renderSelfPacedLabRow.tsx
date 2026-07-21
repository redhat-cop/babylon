import React from 'react';
import { SelfPacedLab, ServiceActionActions } from '@app/types';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import { displayName, getStageFromK8sObject } from '@app/util';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import TimeInterval from '@app/components/TimeInterval';
import { Link } from 'react-router-dom';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import Label from '@app/components/Label';
import SelfPacedLabStatus from '@app/components/SelfPacedLabStatus';

const renderSelfPacedLabRow = ({
  selfPacedLab,
  showModal,
  isAdmin,
}: {
  selfPacedLab: SelfPacedLab;
  showModal: ({
    modal,
    action,
    selfPacedLab,
  }: {
    modal: string;
    action?: ServiceActionActions;
    selfPacedLab?: SelfPacedLab;
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

  const nameCell = (
    <>
      <Link
        key="selfpacedlab-name"
        to={`/selfpacedlabs/${selfPacedLab.metadata.namespace}/${selfPacedLab.metadata.name}`}
      >
        {displayName(selfPacedLab)}
      </Link>
      {stage !== 'prod' ? <Label key="selfpacedlab-name__stage">{stage}</Label> : null}
      <Label key="selfpacedlab-name__type" tooltipDescription={<div>Self-paced lab with warm pool of pre-provisioned instances</div>}>
        Self-Paced Lab
      </Label>
      {isAdmin ? <OpenshiftConsoleLink key="selfpacedlab-name__console" resource={selfPacedLab} /> : null}
    </>
  );
  const guidCell = <span key="selfpacedlab-guid">-</span>;
  const statusCell = autoStartTime && autoStartTime > Date.now() ? (
    <span className="services-item__status--scheduled" key="scheduled">
      <CheckCircleIcon key="scheduled-icon" /> Scheduled
    </span>
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

export default renderSelfPacedLabRow;
