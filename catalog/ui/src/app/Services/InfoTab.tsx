import React from 'react';
import { ResourceClaim } from '@app/types';
import { createAsciiDocTemplate, getMostRelevantResourceAndTemplate } from './service-utils';
import { renderContent } from '@app/util';
import LoadingSection from '@app/components/LoadingSection';
import ServiceStatus from './ServiceStatus';

const InfoTab: React.FC<{ resourceClaim: ResourceClaim }> = ({ resourceClaim }) => {
  const { resource, template } = getMostRelevantResourceAndTemplate(resourceClaim);
  const provision_vars = Object.assign(
    {},
    ...resourceClaim.status?.resources.flatMap((resource) => ({
      [resource.name]: resource.state.spec.vars?.provision_data
        ? { ...resource.state.spec.vars?.provision_data }
        : null,
    }))
  );
  const provision_vars_keys = resourceClaim.status?.resources.map((r) => r.name);
  const asciiDocTemplate = createAsciiDocTemplate(resourceClaim.spec.infoTemplate, provision_vars);
  const htmlRenderedTemplate = renderContent(asciiDocTemplate);
  const isLoading = provision_vars_keys.some((attr) => htmlRenderedTemplate.includes(`{${attr}`));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--pf-global--spacer--sm)' }}>
        Status:{' '}
        <ServiceStatus
          creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
          resource={resource}
          resourceTemplate={template}
          resourceClaim={resourceClaim}
        />
      </div>
      {isLoading ? (
        <LoadingSection />
      ) : (
        <div
          className="info-tab__content"
          dangerouslySetInnerHTML={{
            __html: htmlRenderedTemplate,
          }}
        />
      )}
    </div>
  );
};

export default InfoTab;
