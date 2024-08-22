import React, { useCallback, useMemo, useState } from 'react';
import { Banner, Button } from '@patternfly/react-core';
import useSWRImmutable from 'swr/immutable';
import { Incident } from '@app/types';
import { apiPaths, fetcher } from '@app/api';
import InfoCircleIcon from '@patternfly/react-icons/dist/js/icons/info-circle-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import CloseIcon from '@patternfly/react-icons/dist/js/icons/close-icon';
import TimeInterval from './TimeInterval';
import EditorViewer from './Editor/EditorViewer';
import useSession from '@app/utils/useSession';

import './incidents-banner.css';

const STORAGE_KEY = `${location?.hostname || 'demo.redhat.com'}.incidents.closed`;

const IncidentsBanner: React.FC = () => {
  const { userInterface } = useSession().getSession();
  const { data } = useSWRImmutable<Incident[]>(
    apiPaths.INCIDENTS({ status: 'active', userInterface: userInterface }),
    fetcher,
    {
      shouldRetryOnError: false,
      suspense: false,
    },
  );
  const [closedItemsStr, setClosedItemsStr] = useState(localStorage.getItem(STORAGE_KEY));
  const closedItems: { id: number; timestamp: number }[] = useMemo(() => {
    try {
      return JSON.parse(closedItemsStr) || [];
    } catch {
      return [];
    }
  }, [closedItemsStr]);
  const handleClose = useCallback(
    (id: number) => {
      let items = closedItems || [];
      items.push({ id, timestamp: Date.now() });
      const itemsStr = JSON.stringify(items);
      localStorage.setItem(STORAGE_KEY, itemsStr);
      setClosedItemsStr(itemsStr);
    },
    [closedItems],
  );

  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  return (
    <>
      {data
        .filter((i) => !closedItems.find((c) => c.id === i.id))
        .map((i) => (
          <Banner
            key={i.id}
            isSticky
            screenReaderText={i.message}
            variant={i.level === 'info' ? 'blue' : i.level === 'critical' ? 'red' : 'gold'}
          >
            <div
              style={{
                display: 'flex',
                gap: 'var(--pf-v5-global--spacer--sm)',
                flexDirection: 'row',
                padding: 'var(--pf-v5-global--spacer--sm) var(--pf-v5-global--spacer--xs)',
                position: 'relative',
              }}
            >
              <div>
                {i.level === 'info' && <InfoCircleIcon />}
                {i.level === 'warning' && <ExclamationTriangleIcon />}
                {i.level === 'critical' && <ExclamationCircleIcon />}
              </div>
              <div style={{ whiteSpace: 'normal' }}>
                <EditorViewer value={i.message} />
                <p
                  style={{
                    fontStyle: 'italic',
                    fontSize: 'xs',
                    marginTop: 'var(--pf-v5-global--spacer--sm)',
                    opacity: 0.75,
                  }}
                >
                  Last update <TimeInterval toTimestamp={i.updated_at} />
                </p>
              </div>
              <Button
                onClick={() => handleClose(i.id)}
                variant="plain"
                style={{ color: '#000', position: 'absolute', top: 0, right: 0 }}
                className="incidents-banner__close-btn"
              >
                <CloseIcon />
              </Button>
            </div>
          </Banner>
        ))}
    </>
  );
};

export default IncidentsBanner;
