import React, { useMemo, useState } from 'react';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import { MessageTemplate, ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import { DEMO_DOMAIN, renderContent } from '@app/util';
import {
  Content,
  ContentVariants,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  MenuToggle,
  MenuToggleElement,
  Select,
  SelectList,
  SelectOption,
  Stack,
  StackItem,
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

import './WorkshopInfoTab.css';

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
  const [now] = useState(() => Date.now());
  const [selectedInfoClaimIndex, setSelectedInfoClaimIndex] = useState(0);
  const [infoSourceSelectOpen, setInfoSourceSelectOpen] = useState(false);
  // Get info message template from the workshop annotations
  const infoMessageTemplate = getWorkshopInfoMessageTemplate(workshop);
  const isLocked = isWorkshopLocked(workshop);

  const { start: autoStartTime, end: autoDestroyTime } = getWorkshopLifespan(workshop, workshopProvisions);
  const autoStopTime = getWorkshopAutoStopTime(workshop, resourceClaims);

  const activeResourceClaimsForInfo = useMemo(
    () => resourceClaims.filter((r) => !r.metadata.deletionTimestamp),
    [resourceClaims],
  );

  const effectiveInfoClaimIndex =
    activeResourceClaimsForInfo.length === 0
      ? 0
      : Math.min(selectedInfoClaimIndex, activeResourceClaimsForInfo.length - 1);
  const resourceClaimForInfo =
    activeResourceClaimsForInfo.length > 0
      ? activeResourceClaimsForInfo[effectiveInfoClaimIndex]
      : undefined;

  const infoHtml = useMemo(() => {
    if (!infoMessageTemplate) {
      return null;
    }

    const provision_vars: object = resourceClaimForInfo
      ? Object.assign(
          {},
          ...(resourceClaimForInfo.status?.resources || []).flatMap((resource) => ({
            [resource.name.split('.').length > 1 ? resource.name.split('.')[1] : resource.name]: resource.state?.spec.vars
              ?.provision_data
              ? { ...resource.state.spec.vars?.provision_data }
              : null,
          })),
          resourceClaimForInfo.status?.summary?.provision_data || {},
        )
      : {};

    const htmlRenderedTemplate = renderContent(infoMessageTemplate.template, {
      format: infoMessageTemplate.templateFormat,
      vars: createAsciiDocAttributes(provision_vars, '--'),
    }).replace(/\s*\{\w[\w-—&;]*\}\s*/g, spinnerSvgString);
    return <AdocWrapper html={htmlRenderedTemplate} />;
  }, [infoMessageTemplate, resourceClaimForInfo]);

  const infoSourceSelectToggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle
      ref={toggleRef}
      id="workshop-info-service-select"
      onClick={() => setInfoSourceSelectOpen((open) => !open)}
      isExpanded={infoSourceSelectOpen}
    >
      {resourceClaimForInfo?.metadata.name ?? '—'}
    </MenuToggle>
  );

  return (
    <div style={{ padding: '0 24px' }}>
      <div>
        <DescriptionList isHorizontal>
          <DescriptionListGroup>
            <DescriptionListTerm>Status</DescriptionListTerm>
            <DescriptionListDescription>
              {autoStartTime && autoStartTime > now ? (
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

          {autoStartTime && autoStartTime > now ? (
            <DescriptionListGroup>
              <DescriptionListTerm>Start Date</DescriptionListTerm>
              <DescriptionListDescription>
                <AutoStopDestroy
                  type="auto-start"
                  variant="extended"
                  onClick={() => {
                    if (!isLocked) {
                      showModal({ resourceClaims: [], action: 'scheduleStart' });
                    }
                  }}
                  isDisabled={isLocked}
                  className="workshops-item__schedule-btn"
                  time={autoStartTime}
                />
              </DescriptionListDescription>
            </DescriptionListGroup>
          ) : null}

          {checkWorkshopCanStop(resourceClaims) || (autoStartTime && autoStartTime > now) ? (
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

      {infoMessageTemplate && activeResourceClaimsForInfo.length > 0 ? (
        <>
          <Divider className="workshop-info-tab__section-divider" />
          <section className="workshop-info-tab__instance-panel">
            <Stack hasGutter>
              <StackItem>
                <Content component={ContentVariants.small} className="pf-v6-u-color-text-subtle">
                  The message below is filled using data from the instance you choose. Change the
                  selection to view another instance&apos;s values.
                </Content>
              </StackItem>
              <StackItem>
                <div className="workshop-info-tab__source-toolbar">
                  <label className="workshop-info-tab__source-label" htmlFor="workshop-info-service-select">
                    Show data from
                  </label>
                  <Select
                    isOpen={infoSourceSelectOpen}
                    onSelect={(_event, selected) => {
                      const selectedValue = typeof selected === 'string' ? selected : String(selected);
                      const index = Number.parseInt(selectedValue, 10);
                      if (!Number.isNaN(index)) {
                        setSelectedInfoClaimIndex(index);
                      }
                      setInfoSourceSelectOpen(false);
                    }}
                    selected={String(effectiveInfoClaimIndex)}
                    onOpenChange={(isOpen) => setInfoSourceSelectOpen(isOpen)}
                    toggle={infoSourceSelectToggle}
                  >
                    <SelectList>
                      {activeResourceClaimsForInfo.map((rc, i) => (
                        <SelectOption key={rc.metadata.uid} value={String(i)}>
                          {rc.metadata.name}
                        </SelectOption>
                      ))}
                    </SelectList>
                  </Select>
                </div>
                <div className="workshop-info-tab__content-well">{infoHtml}</div>
              </StackItem>
            </Stack>
          </section>
        </>
      ) : (
        infoHtml
      )}
    </div>
  );
};

export default WorkshopInfoTab;
