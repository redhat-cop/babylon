import React, { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  PageSection,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import AngleRightIcon from '@patternfly/react-icons/dist/js/icons/angle-right-icon';
import AngleDownIcon from '@patternfly/react-icons/dist/js/icons/angle-down-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import { apiPaths, deleteResourceClaim, fetcher } from '@app/api';
import { ResourceClaim, ResourceClaimList } from '@app/types';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import TimeInterval from '@app/components/TimeInterval';
import ServiceStatus from '@app/Services/ServiceStatus';
import { displayName, BABYLON_DOMAIN, FETCH_BATCH_LIMIT, compareK8sObjectsArr } from '@app/util';
import Modal, { useModal } from '@app/Modal/Modal';
import Footer from '@app/components/Footer';
import ServicesAction from '@app/Services/ServicesAction';

import './admin.css';

const SHARED_CLUSTERS_NAMESPACE = 'shared-clusters';

type ClusterGroup = {
  catalogItemName: string;
  catalogItemNamespace: string;
  catalogItemDisplayName: string;
  clusters: ResourceClaim[];
};

function getClusterStatus(resourceClaim: ResourceClaim): string {
  const summary = resourceClaim.status?.summary;
  if (summary?.state) {
    const state = summary.state.toLowerCase();
    if (state === 'started' || state === 'running') return 'Running';
    if (state === 'provisioning') return 'Provisioning';
    if (state === 'stopped') return 'Stopped';
    if (state.endsWith('-failed')) return 'Failed';
    return summary.state;
  }
  const resource = resourceClaim.status?.resources?.[0]?.state;
  if (resource?.kind === 'AnarchySubject') {
    const currentState = resource.spec?.vars?.current_state;
    if (currentState === 'started') return 'Running';
    if (currentState) return currentState.charAt(0).toUpperCase() + currentState.slice(1).replace(/-/g, ' ');
  }
  return 'Unknown';
}

function getClusterPurpose(resourceClaim: ResourceClaim): string {
  return (resourceClaim.spec?.provider?.parameterValues as Record<string, unknown>)?.sandbox_host_purpose as string || '-';
}

function buildGroups(resourceClaims: ResourceClaim[]): ClusterGroup[] {
  const groupMap = new Map<string, ClusterGroup>();

  for (const rc of resourceClaims) {
    const catalogItemName = rc.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`] || 'unknown';
    const catalogItemNamespace = rc.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemNamespace`] || '';
    const key = `${catalogItemNamespace}/${catalogItemName}`;

    if (!groupMap.has(key)) {
      const ciDisplayName =
        rc.metadata.annotations?.[`${BABYLON_DOMAIN}/catalogItemDisplayName`] || displayName(rc);
      groupMap.set(key, {
        catalogItemName,
        catalogItemNamespace,
        catalogItemDisplayName: ciDisplayName,
        clusters: [],
      });
    }
    groupMap.get(key).clusters.push(rc);
  }

  return Array.from(groupMap.values()).sort((a, b) =>
    a.catalogItemDisplayName.localeCompare(b.catalogItemDisplayName),
  );
}

function getGroupStatusSummary(clusters: ResourceClaim[]): string {
  const total = clusters.length;
  const running = clusters.filter((c) => {
    const status = getClusterStatus(c);
    return status === 'Running';
  }).length;
  if (running === total) return 'All Running';
  return `${running} / ${total} Running`;
}

function keywordMatch(r: ResourceClaim, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (r.metadata.name.includes(kw)) return true;
  if (displayName(r).toLowerCase().includes(kw)) return true;
  const purpose = getClusterPurpose(r);
  if (purpose.toLowerCase().includes(kw)) return true;
  return false;
}

const SharedClusters: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { cache } = useSWRConfig();
  const hasSearch = searchParams.has('search');
  const searchValue = searchParams.get('search');
  const keywordFilter = useMemo(
    () =>
      hasSearch
        ? searchValue
            .trim()
            .split(/ +/)
            .filter((w) => w !== '')
        : null,
    [hasSearch, searchValue],
  );

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [modalState, setModalState] = useState<{
    action: 'delete';
    resourceClaim?: ResourceClaim;
    submitDisabled: false;
  }>({ action: null, submitDisabled: false });
  const [modalAction, openModalAction] = useModal();

  const {
    data: resourceClaimsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<ResourceClaimList>(
    (index, previousPageData: ResourceClaimList) => {
      if (previousPageData && !previousPageData.metadata?.continue) return null;
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.RESOURCE_CLAIMS({
        namespace: SHARED_CLUSTERS_NAMESPACE,
        limit: FETCH_BATCH_LIMIT,
        continueId,
      });
    },
    fetcher,
    {
      refreshInterval: 8000,
      revalidateFirstPage: true,
      revalidateAll: true,
      compare: (currentData, newData) => {
        if (currentData === newData) return true;
        if (!currentData || currentData.length === 0) return false;
        if (!newData || newData.length === 0) return false;
        if (currentData.length !== newData.length) return false;
        for (let i = 0; i < currentData.length; i++) {
          if (!compareK8sObjectsArr(currentData[i].items, newData[i].items)) return false;
        }
        return true;
      },
    },
  );

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: ResourceClaim[]; action: 'update' | 'delete' }) => {
      const pagesCopy = JSON.parse(JSON.stringify(resourceClaimsPages));
      for (const [i, page] of pagesCopy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = page.items.findIndex((r: ResourceClaim) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              pagesCopy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              pagesCopy[i].items.splice(foundIndex, 1);
            }
            mutate(pagesCopy);
          }
        }
      }
    },
    [mutate, resourceClaimsPages],
  );

  const isReachingEnd = resourceClaimsPages && !resourceClaimsPages[resourceClaimsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !resourceClaimsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && resourceClaimsPages && typeof resourceClaimsPages[size - 1] === 'undefined');

  const filterResourceClaim = useCallback(
    (resourceClaim: ResourceClaim) => {
      if (!keywordFilter) return true;
      for (const keyword of keywordFilter) {
        if (!keywordMatch(resourceClaim, keyword)) return false;
      }
      return true;
    },
    [keywordFilter],
  );

  const resourceClaims: ResourceClaim[] = useMemo(
    () => [].concat(...(resourceClaimsPages || []).map((page) => page.items)).filter(filterResourceClaim),
    [filterResourceClaim, resourceClaimsPages],
  );

  const groups = useMemo(() => buildGroups(resourceClaims), [resourceClaims]);

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const onModalAction = useCallback(async (): Promise<void> => {
    if (modalState.resourceClaim) {
      cache.delete(
        apiPaths.RESOURCE_CLAIM({
          namespace: modalState.resourceClaim.metadata.namespace,
          resourceClaimName: modalState.resourceClaim.metadata.name,
        }),
      );
      const deleted = await deleteResourceClaim(modalState.resourceClaim);
      revalidate({ updatedItems: [deleted], action: 'delete' });
    }
  }, [cache, modalState.resourceClaim, revalidate]);

  const showDeleteModal = useCallback(
    (resourceClaim: ResourceClaim) => {
      setModalState({ action: 'delete', resourceClaim, submitDisabled: false });
      openModalAction();
    },
    [openModalAction],
  );

  const scrollHandler = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollable = e.currentTarget;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !isReachingEnd && !isLoadingMore) {
      setSize(size + 1);
    }
  };

  if (
    keywordFilter &&
    resourceClaimsPages &&
    resourceClaimsPages.length > 0 &&
    resourceClaimsPages[resourceClaimsPages.length - 1].metadata.continue
  ) {
    if (!isLoadingMore) {
      if (resourceClaims.length > 0) {
        setTimeout(() => setSize(size + 1), 5000);
      } else {
        setSize(size + 1);
      }
    }
  }

  return (
    <div onScroll={scrollHandler} className="admin-container">
      <Modal ref={modalAction} onConfirm={onModalAction} passModifiers={true}>
        <ServicesAction actionState={modalState} />
      </Modal>
      <PageSection hasBodyWrapper={false} key="header" className="admin-header">
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Shared Clusters
            </Title>
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              placeholder="Search..."
              onSearch={(value) => {
                if (value) {
                  searchParams.set('search', value.join(' '));
                } else if (searchParams.has('search')) {
                  searchParams.delete('search');
                }
                setSearchParams(searchParams);
              }}
            />
          </SplitItem>
        </Split>
      </PageSection>
      {resourceClaims.length === 0 && isReachingEnd ? (
        <PageSection hasBodyWrapper={false} key="body-empty">
          <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No shared clusters found" variant="full">
            <EmptyStateFooter>
              {keywordFilter ? (
                <EmptyStateBody>No clusters matched search.</EmptyStateBody>
              ) : (
                <EmptyStateBody>
                  No ResourceClaims found in the {SHARED_CLUSTERS_NAMESPACE} namespace.
                </EmptyStateBody>
              )}
            </EmptyStateFooter>
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection hasBodyWrapper={false} key="body" className="admin-body">
          <table className="pf-v6-c-table pf-m-grid-md" role="grid">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Name</th>
                <th>Project</th>
                <th>Purpose</th>
                <th>Status</th>
                <th>Placements</th>
                <th>Sandbox API</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const groupKey = `${group.catalogItemNamespace}/${group.catalogItemName}`;
                const isExpanded = expandedGroups.has(groupKey);
                const clusterCount = group.clusters.length;
                const statusSummary = getGroupStatusSummary(group.clusters);
                const allRunning = group.clusters.every((c) => getClusterStatus(c) === 'Running');

                return (
                  <React.Fragment key={groupKey}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <td style={{ width: '40px', textAlign: 'center' }}>
                        {isExpanded ? <AngleDownIcon /> : <AngleRightIcon />}
                      </td>
                      <td>
                        <strong>{group.catalogItemDisplayName} (Cluster)</strong>{' '}
                        <Label isCompact>
                          {clusterCount} cluster{clusterCount !== 1 ? 's' : ''}
                        </Label>
                      </td>
                      <td>{SHARED_CLUSTERS_NAMESPACE}</td>
                      <td></td>
                      <td>
                        <span
                          className={allRunning ? 'service-status--running' : 'service-status--in-progress'}
                          style={{ textTransform: 'capitalize' }}
                        >
                          {statusSummary}
                        </span>
                      </td>
                      <td>-</td>
                      <td>-</td>
                      <td></td>
                      <td></td>
                    </tr>
                    {isExpanded
                      ? group.clusters.map((cluster) => (
                          <tr key={cluster.metadata.uid}>
                            <td></td>
                            <td style={{ paddingLeft: 'var(--pf-t--global--spacer--xl)' }}>
                              <Link
                                to={`/services/${cluster.metadata.namespace}/${cluster.metadata.name}`}
                                style={{ color: 'var(--pf-t--color--orange--60)' }}
                              >
                                {cluster.metadata.name}
                              </Link>
                            </td>
                            <td>{cluster.metadata.namespace}</td>
                            <td>{getClusterPurpose(cluster)}</td>
                            <td>
                              <ServiceStatus resourceClaim={cluster} />
                            </td>
                            <td>-</td>
                            <td>-</td>
                            <td>
                              <TimeInterval toTimestamp={cluster.metadata.creationTimestamp} />
                            </td>
                            <td>
                              <button
                                className="pf-v6-c-button pf-m-plain"
                                onClick={() => showDeleteModal(cluster)}
                                aria-label={`Delete ${cluster.metadata.name}`}
                              >
                                <TrashIcon />
                              </button>
                            </td>
                          </tr>
                        ))
                      : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {!isReachingEnd ? <EmptyState icon={LoadingIcon} variant="full"></EmptyState> : null}
        </PageSection>
      )}
      <Footer />
    </div>
  );
};

export default SharedClusters;
