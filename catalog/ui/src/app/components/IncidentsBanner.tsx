import React from 'react';
import { Banner, Flex, FlexItem } from '@patternfly/react-core';
import useSWRImmutable from 'swr/immutable';
import { Incident } from '@app/types';
import { apiPaths, fetcher } from '@app/api';
import InfoCircleIcon from '@patternfly/react-icons/dist/js/icons/info-circle-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import TimeInterval from './TimeInterval';

const IncidentsBanner: React.FC = () => {
  const { data } = useSWRImmutable<Incident[]>(apiPaths.INCIDENTS({ status: 'active' }), fetcher);
  return (
    <>
      {data.map((i) => (
        <Banner
          isSticky
          screenReaderText={i.message}
          variant={i.level === 'info' ? 'info' : i.level === 'critical' ? 'danger' : 'warning'}
        >
          <Flex spaceItems={{ default: 'spaceItemsSm' }}>
            <FlexItem>
              {i.level === 'info' && <InfoCircleIcon />}
              {i.level === 'warning' && <ExclamationTriangleIcon />}
              {i.level === 'critical' && <ExclamationCircleIcon />}
            </FlexItem>
            <FlexItem>
              <p>{i.message}</p>
              <p style={{ fontStyle: 'italic', fontSize: 'sm' }}>
                <TimeInterval toTimestamp={i.updated_at} />
              </p>
            </FlexItem>
          </Flex>
        </Banner>
      ))}
    </>
  );
};

export default IncidentsBanner;
