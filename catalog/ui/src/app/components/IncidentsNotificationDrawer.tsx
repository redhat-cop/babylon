import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import {
  NotificationBadge,
  NotificationDrawer,
  NotificationDrawerBody,
  NotificationDrawerHeader,
  NotificationDrawerList,
  NotificationDrawerListItem,
  NotificationDrawerListItemBody,
  NotificationDrawerListItemHeader,
  ToolbarItem,
  EmptyState,
  EmptyStateVariant,
} from '@patternfly/react-core';
import useSWRImmutable from 'swr/immutable';
import { Incident } from '@app/types';
import { apiPaths, fetcher } from '@app/api';
import useSession from '@app/utils/useSession';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';
import { useNotificationDrawer } from '@app/AppLayout/NotificationDrawerContext';
import TimeInterval from './TimeInterval';
import EditorViewer from './Editor/EditorViewer';
import { SearchIcon } from '@patternfly/react-icons';

const READ_INCIDENTS_STORAGE_KEY = 'incidents_notification_read_ids';

// Extract a short title from HTML/rich text message
const extractTitle = (message: string, maxLength: number = 60): string => {
  // Create a temporary div to parse HTML and extract text
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = message;
  const text = tempDiv.textContent || tempDiv.innerText || message;
  // Take first line or truncate
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length <= maxLength) {
    return firstLine;
  }
  return firstLine.substring(0, maxLength) + '...';
};

const getReadIncidentIds = (): Set<number> => {
  try {
    const stored = localStorage.getItem(READ_INCIDENTS_STORAGE_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Failed to read incidents from localStorage:', e);
  }
  return new Set();
};

const saveReadIncidentIds = (ids: Set<number>): void => {
  try {
    localStorage.setItem(READ_INCIDENTS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch (e) {
    console.error('Failed to save incidents to localStorage:', e);
  }
};

const IncidentsNotificationDrawer: React.FC = () => {
  const drawerRef = useRef<HTMLElement | null>(null);
  const { userInterface } = useSession().getSession();
  const { incidents_enabled } = useInterfaceConfig();
  const notificationDrawerContext = useNotificationDrawer();

  // Track read incident IDs
  const [readIncidentIds, setReadIncidentIds] = useState<Set<number>>(() => getReadIncidentIds());

  // Extract stable methods from context to avoid dependency issues
  const setNotificationDrawer = notificationDrawerContext?.setNotificationDrawer;
  const setIsDrawerExpanded = notificationDrawerContext?.setIsDrawerExpanded;
  const isDrawerExpanded = notificationDrawerContext?.isDrawerExpanded ?? false;

  const { data: incidents } = useSWRImmutable<Incident[]>(
    apiPaths.INCIDENTS({ status: 'active', userInterface: userInterface }),
    fetcher,
    {
      shouldRetryOnError: false,
      suspense: false,
    },
  );

  // Map incident level to notification variant
  const getNotificationVariant = (level: Incident['level']): 'info' | 'warning' | 'danger' | 'success' => {
    switch (level) {
      case 'critical':
        return 'danger';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'info';
    }
  };

  const onCloseNotificationDrawer = useCallback(() => {
    if (setIsDrawerExpanded) {
      setIsDrawerExpanded(false);
    }
  }, [setIsDrawerExpanded]);

  // Calculate unread incidents count
  const unreadIncidents = useMemo(() => {
    if (!incidents) return [];
    return incidents.filter((incident) => !readIncidentIds.has(incident.id));
  }, [incidents, readIncidentIds]);

  // Mark all incidents as read when the drawer is opened
  useEffect(() => {
    if (isDrawerExpanded && incidents && incidents.length > 0) {
      setReadIncidentIds((prevReadIds) => {
        const currentIncidentIds = new Set(incidents.map((i) => i.id));
        // Only keep read IDs that are still active (cleanup old ones)
        const validReadIds = new Set([...prevReadIds].filter((id) => currentIncidentIds.has(id)));
        // Add all current incident IDs as read
        incidents.forEach((incident) => validReadIds.add(incident.id));

        saveReadIncidentIds(validReadIds);
        return validReadIds;
      });
    }
  }, [isDrawerExpanded, incidents]);

  // Set up notification drawer
  useEffect(() => {
    if (!setNotificationDrawer) {
      return;
    }

    if (!incidents_enabled) {
      setNotificationDrawer(null);
      return;
    }

    const notificationDrawer = (
      <NotificationDrawer ref={drawerRef}>
        <NotificationDrawerHeader onClose={onCloseNotificationDrawer} title="Notifications" />
        <NotificationDrawerBody>
          {incidents && incidents?.length > 0 ? (
            <NotificationDrawerList>
              {incidents.map((incident) => {
                const variant = getNotificationVariant(incident.level);
                return (
                  <NotificationDrawerListItem
                    key={incident.id}
                    variant={variant}
                    isRead={readIncidentIds.has(incident.id)}
                  >
                    <NotificationDrawerListItemHeader
                      variant={variant}
                      title={extractTitle(incident.message)}
                      srTitle={`${incident.level} notification:`}
                    />
                    <NotificationDrawerListItemBody timestamp={<TimeInterval toTimestamp={incident.updated_at} />}>
                      <div style={{ whiteSpace: 'normal' }}>
                        <EditorViewer value={incident.message} />
                      </div>
                    </NotificationDrawerListItemBody>
                  </NotificationDrawerListItem>
                );
              })}
            </NotificationDrawerList>
          ) : (
            <EmptyState
              headingLevel="h2"
              titleText="No active notifications"
              icon={SearchIcon}
              variant={EmptyStateVariant.full}
            >
              <p>There are currently no active notifications.</p>
            </EmptyState>
          )}
        </NotificationDrawerBody>
      </NotificationDrawer>
    );

    setNotificationDrawer(notificationDrawer);
  }, [incidents, incidents_enabled, onCloseNotificationDrawer, setNotificationDrawer, readIncidentIds]);

  const handleBadgeClick = useCallback(
    (event: React.MouseEvent) => {
      // Prevent event from bubbling to Page component's handler
      event.stopPropagation();
      event.preventDefault();
      // Toggle state directly instead of calling onNotificationDrawerExpand
      if (setIsDrawerExpanded) {
        setIsDrawerExpanded(!isDrawerExpanded);
      }
    },
    [setIsDrawerExpanded, isDrawerExpanded],
  );

  // Return the NotificationBadge to be added to the Header toolbar
  if (!notificationDrawerContext || !incidents_enabled) return null;

  return (
    <ToolbarItem visibility={{ default: 'visible' }} selected={isDrawerExpanded}>
      <NotificationBadge
        variant={unreadIncidents.length > 0 ? 'unread' : 'read'}
        count={incidents?.length || 0}
        onClick={handleBadgeClick}
        aria-label="Notifications"
        isExpanded={isDrawerExpanded}
      />
    </ToolbarItem>
  );
};

export default IncidentsNotificationDrawer;
