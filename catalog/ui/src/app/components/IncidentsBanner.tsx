import React from 'react';
import { Banner } from '@patternfly/react-core';
import useSWRImmutable from 'swr/immutable';
import { Incident } from '@app/types';
import { apiPaths, fetcher } from '@app/api';
import InfoCircleIcon from '@patternfly/react-icons/dist/js/icons/info-circle-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import TimeInterval from './TimeInterval';
import EditorViewer from './Editor/EditorViewer';

import './incidents-banner.css';

const IncidentsBanner: React.FC = () => {
  const { data } = useSWRImmutable<Incident[]>(apiPaths.INCIDENTS({ status: 'active' }), fetcher, {
    shouldRetryOnError: false,
    suspense: false,
  });
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  return (
    <>
      {data.map((i) => (
        <Banner
          key={i.id}
          isSticky
          screenReaderText={i.message}
          variant={i.level === 'info' ? 'info' : i.level === 'critical' ? 'danger' : 'warning'}
        >
          <div
            style={{
              display: 'flex',
              gap: 'var(--pf-global--spacer--md)',
              flexDirection: 'row',
              padding: 'var(--pf-global--spacer--md) var(--pf-global--spacer--sm)',
            }}
          >
            <div>
              {i.level === 'info' && <InfoCircleIcon />}
              {i.level === 'warning' && <ExclamationTriangleIcon />}
              {i.level === 'critical' && <ExclamationCircleIcon />}
            </div>
            <div style={{ whiteSpace: 'normal' }}>
              <EditorViewer value={i.message} />
              <p style={{ fontStyle: 'italic', fontSize: 'xs', marginTop: 'var(--pf-global--spacer--md)' }}>
                Last update <TimeInterval toTimestamp={i.updated_at} />
              </p>
            </div>
          </div>
        </Banner>
      ))}
    </>
  );
};

export default IncidentsBanner;
