import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  Spinner,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import RedoIcon from '@patternfly/react-icons/dist/js/icons/redo-icon';
import { BABYLON_DOMAIN } from '@app/util';
import yaml from 'js-yaml';
import { AnarchySubject, ResourceClaim, ResourceClaimSpecResourceTemplate } from '@app/types';
import LocalTimestamp from '@app/components/LocalTimestamp';

import './service-item-status.css';

function getCheckStatusStateFromResource(
  resourceState: AnarchySubject,
  resourceTemplate: ResourceClaimSpecResourceTemplate,
) {
  const resourceStateVars = resourceState?.spec?.vars;
  const resourceTemplateVars = resourceTemplate.spec?.vars;
  if (resourceStateVars?.check_status_state && resourceStateVars.check_status_state !== 'successful') {
    return resourceStateVars.check_status_state;
  }
  if (
    resourceTemplateVars?.check_status_request_timestamp &&
    (!resourceState?.status?.towerJobs?.status?.startTimestamp ||
      resourceState.status.towerJobs.status.startTimestamp < resourceTemplateVars.check_status_request_timestamp)
  ) {
    return 'requested';
  }
  return null;
}

const ServiceItemStatus: React.FC<{
  onCheckStatusRequest: () => Promise<void>;
  resourceClaim: ResourceClaim;
}> = ({ onCheckStatusRequest, resourceClaim }) => {
  // Extract the last status check request timestamp
  const lastRequestTimestamp = resourceClaim.spec.resources?.reduce<string | undefined>(
    (lastTimestamp, resourceSpec) => {
      const ts = resourceSpec?.template?.spec?.vars?.check_status_request_timestamp;
      if (ts) {
        if (lastTimestamp) {
          return ts > lastTimestamp ? ts : lastTimestamp;
        } else {
          return ts;
        }
      } else {
        return lastTimestamp;
      }
    },
    undefined,
  );
  const lastRequestDate = lastRequestTimestamp ? Date.parse(lastRequestTimestamp) : null;
  const lastRequestMillisecondsAgo = lastRequestDate ? Date.now() - lastRequestDate : null;

  // Extract the last status completion from resource status
  const lastUpdateTimestamp = resourceClaim.status.resources?.reduce((lastTimestamp, resourceStatus) => {
    const ts = resourceStatus?.state?.status?.towerJobs?.status?.completeTimestamp;
    if (ts) {
      if (lastTimestamp) {
        return ts > lastTimestamp ? ts : lastTimestamp;
      } else {
        return ts;
      }
    } else {
      return lastTimestamp;
    }
  }, '');

  // Possible check status states
  // - requested
  // - pending
  // - running
  const checkStatusState = resourceClaim.spec.resources?.reduce<string | undefined>(
    (reducedCheckState, resourceSpec, idx) => {
      const resourceState = resourceClaim.status.resources[idx].state;
      const resourceCheckState = getCheckStatusStateFromResource(resourceState, resourceSpec.template);
      if (resourceCheckState === 'running' || reducedCheckState === 'running') {
        return 'running';
      } else if (resourceCheckState === 'pending' || reducedCheckState === 'pending') {
        return 'pending';
      } else if (resourceCheckState === 'requested' || reducedCheckState === 'requested') {
        return 'requested';
      }
      return undefined;
    },
    undefined,
  );

  // Save refresh requested in state to immediately disable the refresh button
  const [refreshRequested, setRefreshRequested] = useState(false);

  // Save last update timestamp as the value is lost when update begins running.
  const [saveLastUpdateTimestamp, setSaveLastUpdateTimestamp] = useState(lastUpdateTimestamp);

  const requestStatusCheck = useCallback(() => {
    onCheckStatusRequest();
    setRefreshRequested(true);
  }, [onCheckStatusRequest]);

  // Immediately request a status check if last check is over 5 minutes ago.
  useEffect(() => {
    if (lastUpdateTimestamp) {
      setSaveLastUpdateTimestamp(lastUpdateTimestamp);
    }
    if ((!checkStatusState && lastRequestMillisecondsAgo === null) || lastRequestMillisecondsAgo > 300000) {
      requestStatusCheck();
    }
  }, [checkStatusState, lastRequestMillisecondsAgo, lastUpdateTimestamp, requestStatusCheck]);

  useEffect(() => {
    setRefreshRequested(false);
  }, [resourceClaim.metadata.resourceVersion]);

  return (
    <>
      <Split key="refresh" className="services-item-status__header">
        <SplitItem isFilled>
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>Last status update</DescriptionListTerm>
              <DescriptionListDescription>
                {saveLastUpdateTimestamp ? <LocalTimestamp timestamp={saveLastUpdateTimestamp} /> : <p>-</p>}
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        </SplitItem>
        <SplitItem>
          {checkStatusState ? (
            <div className="services-item-status-check-state">
              Status check {checkStatusState + ' '} <Spinner size="md" />
            </div>
          ) : null}
        </SplitItem>
        <SplitItem>
          <Button
            icon={<RedoIcon />}
            isDisabled={refreshRequested || checkStatusState ? true : false}
            onClick={requestStatusCheck}
            variant="link"
          >
            Refresh Status
          </Button>
        </SplitItem>
      </Split>
      {(resourceClaim.spec.resources || []).map((resourceSpec, idx) => {
        const resourceStatus = resourceClaim.status?.resources?.[idx];
        const resourceState = resourceStatus?.state;

        if (!resourceState?.status?.supportedActions?.status) {
          return null;
        }

        const componentDisplayName =
          resourceClaim.metadata.annotations?.[`${BABYLON_DOMAIN}/displayNameComponent${idx}`] ||
          resourceSpec.name ||
          resourceSpec.provider?.name;

        const resourceVars = resourceState?.spec?.vars;

        return (
          <div key={componentDisplayName} className="services-item-status__resource">
            <Title headingLevel="h2" size="lg">
              {componentDisplayName}
            </Title>
            <DescriptionList isHorizontal>
              {resourceVars?.status_messages ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Status Messages</DescriptionListTerm>
                  <DescriptionListDescription>
                    <pre>{resourceVars.status_messages}</pre>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
              {resourceVars?.status_data ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Status Data</DescriptionListTerm>
                  <DescriptionListDescription>
                    <pre>{yaml.dump(resourceVars.status_data)}</pre>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
              {!resourceVars?.status_data && !resourceVars?.status_messages ? <p>Status unavailable.</p> : null}
            </DescriptionList>
          </div>
        );
      })}
    </>
  );
};

export default ServiceItemStatus;
