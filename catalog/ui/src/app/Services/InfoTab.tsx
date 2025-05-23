import React, { useMemo } from 'react';
import { ResourceClaim, ServiceActionActions } from '@app/types';
import { BABYLON_DOMAIN, isResourceClaimPartOfWorkshop, renderContent } from '@app/util';
import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Spinner,
} from '@patternfly/react-core';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import ServiceStatus from './ServiceStatus';
import {
  createAsciiDocAttributes,
  getAutoStopTime,
  getInfoMessageTemplate,
  getMostRelevantResourceAndTemplate,
  getStartTime,
} from './service-utils';
import AdocWrapper from '@app/components/AdocWrapper';

const spinnerSvgString = `<svg style="margin: 0 8px;" class="pf-v5-c-spinner pf-m-md" role="progressbar" aria-valuetext="Loading..." viewBox="0 0 100 100" aria-label="Contents"><circle class="pf-v5-c-spinner__path" cx="50" cy="50" r="45" fill="none"></circle></svg>`;

const InfoTab: React.FC<{
  resourceClaim: ResourceClaim;
  showModal: ({
    modal,
    action,
    resourceClaim,
  }: {
    modal: 'action' | 'scheduleAction' | 'createWorkshop';
    action?: ServiceActionActions;
    resourceClaim?: ResourceClaim;
  }) => void;
}> = ({ resourceClaim, showModal }) => {
  const infoMessageTemplate = getInfoMessageTemplate(resourceClaim);
  const { resource: mostRelevantResource, template: mostRelevantTemplate } =
    getMostRelevantResourceAndTemplate(resourceClaim);
  const externalPlatformUrl = resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/internalPlatformUrl`];
  const isPartOfWorkshop = isResourceClaimPartOfWorkshop(resourceClaim);
  const autoStopTime = getAutoStopTime(resourceClaim);
  const startTime = getStartTime(resourceClaim);

  const infoHtml = useMemo(() => {
    const provision_vars: object = Object.assign(
      {},
      ...(resourceClaim.status?.resources || []).flatMap((resource) => ({
        [resource.name.split('.').length > 1 ? resource.name.split('.')[1] : resource.name]: resource.state?.spec.vars
          ?.provision_data
          ? { ...resource.state.spec.vars?.provision_data }
          : null,
      })),
      resourceClaim.status?.summary?.provision_data || {}
    );

    if (!infoMessageTemplate) {
      return null;
    }

    const htmlRenderedTemplate = renderContent(infoMessageTemplate.template, {
      format: infoMessageTemplate.templateFormat,
      vars: createAsciiDocAttributes(provision_vars, '--'),
    }).replace(/\s*\{\w[\w-—&;]*\}\s*/g, spinnerSvgString);
    return <AdocWrapper html={htmlRenderedTemplate} />;
  }, [
    infoMessageTemplate.template,
    infoMessageTemplate.templateFormat,
    JSON.stringify(resourceClaim.status?.resources),
  ]);

  return (
    <div style={{ padding: '0 24px' }}>
      <div>
        <DescriptionList isHorizontal>
          <DescriptionListGroup>
            <DescriptionListTerm>Status:</DescriptionListTerm>
            <DescriptionListDescription>
              <ServiceStatus
                creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                resource={mostRelevantResource}
                resourceTemplate={mostRelevantTemplate}
                resourceClaim={resourceClaim}
                summary={resourceClaim.status?.summary}
              />
            </DescriptionListDescription>
          </DescriptionListGroup>

          {startTime && startTime > Date.now() ? (
            <DescriptionListGroup>
              <DescriptionListTerm>Start</DescriptionListTerm>
              <DescriptionListDescription>
                <AutoStopDestroy
                  type="auto-start"
                  onClick={() => {
                    showModal({ action: 'start', modal: 'scheduleAction', resourceClaim });
                  }}
                  resourceClaim={resourceClaim}
                  className="services-item__schedule-btn"
                  time={startTime}
                  variant="extended"
                ></AutoStopDestroy>
              </DescriptionListDescription>
            </DescriptionListGroup>
          ) : null}

          <DescriptionListGroup>
            <DescriptionListTerm>Auto-stop</DescriptionListTerm>
            <DescriptionListDescription>
              <AutoStopDestroy
                type="auto-stop"
                onClick={() => {
                  showModal({ action: 'stop', modal: 'scheduleAction', resourceClaim });
                }}
                className="services-item__schedule-btn"
                time={autoStopTime}
                variant="extended"
                resourceClaim={resourceClaim}
              />
            </DescriptionListDescription>
          </DescriptionListGroup>

          {!externalPlatformUrl && !isPartOfWorkshop && resourceClaim.status?.lifespan?.end ? (
            <DescriptionListGroup>
              <DescriptionListTerm>Auto-destroy</DescriptionListTerm>
              {resourceClaim.status?.lifespan?.end ? (
                <DescriptionListDescription>
                  <AutoStopDestroy
                    type="auto-destroy"
                    onClick={() => {
                      showModal({ action: 'retirement', modal: 'scheduleAction', resourceClaim });
                    }}
                    className="services-item__schedule-btn"
                    time={resourceClaim.status?.lifespan?.end}
                    variant="extended"
                    resourceClaim={resourceClaim}
                  >
                    {resourceClaim.spec?.lifespan?.end &&
                    resourceClaim.spec.lifespan.end != resourceClaim.status.lifespan.end ? (
                      <>
                        {' '}
                        <Spinner size="md" />
                      </>
                    ) : null}
                  </AutoStopDestroy>
                </DescriptionListDescription>
              ) : (
                <p>-</p>
              )}
            </DescriptionListGroup>
          ) : null}
        </DescriptionList>
      </div>
      {infoHtml}
    </div>
  );
};

export default InfoTab;
