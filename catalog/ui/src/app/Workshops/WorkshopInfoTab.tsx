import React, { useMemo } from 'react';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import { MessageTemplate, ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import { DEMO_DOMAIN, renderContent } from '@app/util';
import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
} from '@patternfly/react-core';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import WorkshopStatus from './WorkshopStatus';
import { createAsciiDocAttributes } from '@app/Services/service-utils';
import {
  checkWorkshopCanStop,
  getWorkshopAutoStopTime,
  getWorkshopLifespan,
  isWorkshopLocked,
} from './workshops-utils';
import AdocWrapper from '@app/components/AdocWrapper';
import { ModalState } from './WorkshopsItem';

const spinnerSvgString = `<svg style="margin: 0 8px;" class="pf-v6-c-spinner pf-m-md" role="progressbar" aria-valuetext="Loading..." viewBox="0 0 100 100" aria-label="Contents"><circle class="pf-v6-c-spinner__path" cx="50" cy="50" r="45" fill="none"></circle></svg>`;

export function getWorkshopInfoMessageTemplate(workshop?: Workshop): MessageTemplate {
  if (!workshop || !workshop.metadata?.annotations?.[`${DEMO_DOMAIN}/info-message-template`]) return null;
  return JSON.parse(workshop.metadata?.annotations?.[`${DEMO_DOMAIN}/info-message-template`]);
}

const WorkshopInfoTab: React.FC<{
  workshop: Workshop;
  resourceClaims: ResourceClaim[];
  workshopProvisions: WorkshopProvision[];
  showModal: ({ action, resourceClaims }: ModalState) => void;
}> = ({ workshop, resourceClaims, workshopProvisions, showModal }) => {
  // Get info message template from the workshop annotations
  const infoMessageTemplate = getWorkshopInfoMessageTemplate(workshop);
  const isLocked = isWorkshopLocked(workshop);

  const { start: autoStartTime, end: autoDestroyTime } = getWorkshopLifespan(workshop, workshopProvisions);
  const autoStopTime = getWorkshopAutoStopTime(workshop, resourceClaims);

  // Use the first resourceClaim with provision data for template variables
  const resourceClaimWithData = useMemo(
    () => resourceClaims?.find((rc) => rc.status?.summary?.provision_data || rc.status?.resources?.some(r => r.state?.spec?.vars?.provision_data)),
    [resourceClaims]
  );

  const infoHtml = useMemo(() => {
    if (!infoMessageTemplate) {
      return null;
    }

    const provision_vars: object = resourceClaimWithData ? Object.assign(
      {},
      ...(resourceClaimWithData.status?.resources || []).flatMap((resource) => ({
        [resource.name.split('.').length > 1 ? resource.name.split('.')[1] : resource.name]: resource.state?.spec.vars
          ?.provision_data
          ? { ...resource.state.spec.vars?.provision_data }
          : null,
      })),
      resourceClaimWithData.status?.summary?.provision_data || {},
    ) : {};

    const htmlRenderedTemplate = renderContent(infoMessageTemplate.template, {
      format: infoMessageTemplate.templateFormat,
      vars: createAsciiDocAttributes(provision_vars, '--'),
    }).replace(/\s*\{\w[\w-—&;]*\}\s*/g, spinnerSvgString);
    return <AdocWrapper html={htmlRenderedTemplate} />;
  }, [infoMessageTemplate, resourceClaimWithData]);

  return (
    <div style={{ padding: '0 24px' }}>
      <div>
        <DescriptionList isHorizontal>
          <DescriptionListGroup>
            <DescriptionListTerm>Status</DescriptionListTerm>
            <DescriptionListDescription>
              {autoStartTime && autoStartTime > Date.now() ? (
                <>
                  <span className="services-item__status--scheduled" key="scheduled">
                    <CheckCircleIcon key="scheduled-icon" /> Scheduled
                  </span>
                  {resourceClaims.length > 0 ? <WorkshopStatus resourceClaims={resourceClaims} /> : null}
                </>
              ) : resourceClaims.length > 0 ? (
                <WorkshopStatus resourceClaims={resourceClaims} />
              ) : (
                <p>...</p>
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>

          {autoStartTime && autoStartTime > Date.now() ? (
            <DescriptionListGroup>
              <DescriptionListTerm>Start Date</DescriptionListTerm>
              <DescriptionListDescription>
                <AutoStopDestroy
                  type="auto-start"
                  variant="extended"
                  onClick={() => showModal({ resourceClaims: [], action: 'scheduleStart' })}
                  className="workshops-item__schedule-btn"
                  time={autoStartTime}
                />
              </DescriptionListDescription>
            </DescriptionListGroup>
          ) : null}

          {checkWorkshopCanStop(resourceClaims) || (autoStartTime && autoStartTime > Date.now()) ? (
            <DescriptionListGroup>
              <DescriptionListTerm>Auto-Stop</DescriptionListTerm>
              <DescriptionListDescription>
                <AutoStopDestroy
                  type="auto-stop"
                  onClick={() => (!isLocked ? showModal({ action: 'scheduleStop', resourceClaims }) : null)}
                  isDisabled={isLocked}
                  time={autoStopTime}
                  variant="extended"
                  className="workshops-item__schedule-btn"
                  destroyTimestamp={autoDestroyTime}
                />
              </DescriptionListDescription>
            </DescriptionListGroup>
          ) : null}

          {resourceClaims ? (
            <DescriptionListGroup>
              <DescriptionListTerm>Auto-Destroy</DescriptionListTerm>
              <DescriptionListDescription>
                <AutoStopDestroy
                  type="auto-destroy"
                  onClick={() => {
                    if (!isLocked) {
                      showModal({ resourceClaims, action: 'scheduleDelete' });
                    }
                  }}
                  time={autoDestroyTime}
                  isDisabled={isLocked}
                  variant="extended"
                  className="workshops-item__schedule-btn"
                  notDefinedMessage="- Not defined -"
                />
              </DescriptionListDescription>
            </DescriptionListGroup>
          ) : null}
        </DescriptionList>
      </div>
      {infoHtml}
    </div>
  );
};

export default WorkshopInfoTab;
