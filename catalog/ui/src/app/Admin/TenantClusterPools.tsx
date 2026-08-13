import React, { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  EmptyState,
  Label,
  PageSection,
  Split,
  SplitItem,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import AngleRightIcon from '@patternfly/react-icons/dist/js/icons/angle-right-icon';
import AngleDownIcon from '@patternfly/react-icons/dist/js/icons/angle-down-icon';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import { apiPaths, fetcherItemsInAllPages } from '@app/api';
import { TenantClusterPool, TenantClusterPoolStatusCluster } from '@app/types';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import TimeInterval from '@app/components/TimeInterval';
import { compareK8sObjectsArr, FETCH_BATCH_LIMIT } from '@app/util';
import useSWR from 'swr';
import SandboxApiActions from '@app/components/SandboxApiActions';
import Footer from '@app/components/Footer';
import useSandboxApi from '@app/utils/useSandboxApi';

import './admin.css';
import './tenant-cluster-pools.css';

function keywordMatch(pool: TenantClusterPool, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (pool.metadata.name.includes(kw)) return true;
  if (pool.metadata.namespace?.includes(kw)) return true;
  if (pool.spec.clusterProvisioning?.provider?.name?.includes(kw)) return true;
  return false;
}

function filterPool(pool: TenantClusterPool, keywordFilter: string[]): boolean {
  if (!keywordFilter) return true;
  for (const keyword of keywordFilter) {
    if (!keywordMatch(pool, keyword)) return false;
  }
  return true;
}

const ClusterChildRow: React.FC<{
  cluster: TenantClusterPoolStatusCluster;
  namespace: string;
}> = ({ cluster, namespace }) => {
  const { status, placementCount, maxPlacements, updating, pendingAction, performAction } = useSandboxApi(cluster.name, namespace, cluster.resourceClaimName);

  return (
    <tr className="tenant-pools-child-row">
      <td></td>
      <td>
        <Link
          to={`/services/${namespace}/${cluster.resourceClaimName}`}
          className="tenant-pools-name-link"
        >
          {cluster.resourceClaimName}
        </Link>
      </td>
      <td>
        <Label isCompact color={sandboxApiStateColor(cluster.sandboxApiState)}>
          {cluster.sandboxApiState}
        </Label>
      </td>
      <td>{status === 'loading' ? <span className="tenant-pools-muted">-</span> : `${placementCount}/${maxPlacements ?? '-'}`}</td>
      <td>
        {status === 'loading' ? (
          <span className="tenant-pools-muted">-</span>
        ) : status === 'available' ? (
          <span className="tenant-pools-onboarded"><CheckCircleIcon /> Onboarded</span>
        ) : status === 'disabled' ? (
          <span className="tenant-pools-not-onboarded">Disabled</span>
        ) : (
          <span className="tenant-pools-not-onboarded">Not onboarded</span>
        )}
      </td>
      <td>
        <SandboxApiActions
          status={status}
          updating={updating}
          pendingAction={pendingAction}
          performAction={performAction}
          isDisabled={cluster.sandboxApiState !== 'available' && cluster.sandboxApiState !== 'removed'}
          size="sm"
        />
      </td>
      <td></td>
    </tr>
  );
};

function sandboxApiStateColor(state: string): 'green' | 'yellow' | 'red' | 'grey' {
  switch (state) {
    case 'available': return 'green';
    case 'pending': return 'yellow';
    case 'disabled': return 'red';
    case 'removed': return 'grey';
    default: return 'grey';
  }
}

const TenantClusterPools: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const keywordFilter = useMemo(
    () =>
      searchParams.has('search')
        ? searchParams
            .get('search')
            .trim()
            .split(/ +/)
            .filter((w) => w != '')
        : null,
    [searchParams.get('search')],
  );
  const [expandedPools, setExpandedPools] = useState<Set<string>>(new Set());

  const { data: tenantClusterPools } = useSWR<TenantClusterPool[]>(
    apiPaths.TENANT_CLUSTER_POOLS({ limit: 'ALL' }),
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.TENANT_CLUSTER_POOLS({
          limit: FETCH_BATCH_LIMIT,
          continueId,
        }),
      ),
    {
      refreshInterval: 8000,
      compare: compareK8sObjectsArr,
    },
  );

  const filterFunction = useCallback(
    (pool: TenantClusterPool) => filterPool(pool, keywordFilter),
    [keywordFilter],
  );

  const filteredPools: TenantClusterPool[] = useMemo(
    () => (tenantClusterPools || []).filter(filterFunction),
    [filterFunction, tenantClusterPools],
  );

  const togglePool = useCallback((poolKey: string) => {
    setExpandedPools((prev) => {
      const next = new Set(prev);
      if (next.has(poolKey)) {
        next.delete(poolKey);
      } else {
        next.add(poolKey);
      }
      return next;
    });
  }, []);

  return (
    <div className="admin-container">
      <PageSection hasBodyWrapper={false} key="header" className="admin-header">
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Tenant Cluster Pools
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
      {filteredPools.length === 0 ? (
        <PageSection hasBodyWrapper={false} key="body-empty">
          <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No Tenant Cluster Pools found" variant="full" />
        </PageSection>
      ) : (
        <PageSection hasBodyWrapper={false} key="body" className="admin-body">
          <div className="tenant-pools-table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '28px' }}></th>
                  <th>Name</th>
                  <th>Clusters</th>
                  <th>Pool Saturation</th>
                  <th>Max Capacity</th>
                  <th>Placements</th>
                  <th>Sandbox API State</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {filteredPools.map((pool) => {
                  const poolKey = `${pool.metadata.namespace}/${pool.metadata.name}`;
                  const isExpanded = expandedPools.has(poolKey);
                  const clusters = pool.status?.clusters || [];
                  const clusterCount = clusters.length;
                  const availableCount = clusters.filter((c) => c.sandboxApiState === 'available').length;

                  // Pool saturation (cluster allocation)
                  const occupiedCount = clusterCount - availableCount;
                  const poolSaturationPercent = clusterCount > 0 ? Math.round((occupiedCount / clusterCount) * 100) : 0;
                  const saturationColor: 'green' | 'orange' | 'red' = poolSaturationPercent < 70 ? 'green' : poolSaturationPercent < 90 ? 'orange' : 'red';

                  // Theoretical max capacity (workshop slots)
                  const maxPlacementsPerCluster = pool.spec?.sandboxHost?.max_placements || 50;
                  const maxTotalPlacements = clusterCount * maxPlacementsPerCluster;
                  const theoreticalMaxWorkshops = occupiedCount * maxPlacementsPerCluster;

                  return (
                    <React.Fragment key={poolKey}>
                      <tr
                        className="tenant-pools-group-header"
                        onClick={() => togglePool(poolKey)}
                      >
                        <td className="tenant-pools-expand-cell">
                          {isExpanded ? (
                            <AngleDownIcon className="tenant-pools-expand-icon" />
                          ) : (
                            <AngleRightIcon className="tenant-pools-expand-icon" />
                          )}
                        </td>
                        <td>
                          <Link
                            to={`/admin/tenantclusterpools/${pool.metadata.namespace}/${pool.metadata.name}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <strong>{pool.metadata.name}</strong>
                          </Link>{' '}
                          <Label isCompact color="blue">
                            {clusterCount} cluster{clusterCount !== 1 ? 's' : ''}
                          </Label>
                        </td>
                        <td>{availableCount} / {clusterCount} available</td>
                        <td>
                          <Tooltip content={`Pool saturation: ${poolSaturationPercent}% (${occupiedCount}/${clusterCount} clusters occupied)`}>
                            <Label isCompact color={saturationColor}>
                              {poolSaturationPercent}%
                            </Label>
                          </Tooltip>
                        </td>
                        <td>
                          <Tooltip content={`Theoretical max: 0-${theoreticalMaxWorkshops} workshops deployed (max ${maxTotalPlacements} total). View Ops page for actual workshop counts.`}>
                            <span style={{ whiteSpace: 'nowrap' }}>
                              0-{theoreticalMaxWorkshops} workshops (max {maxTotalPlacements})
                            </span>
                          </Tooltip>
                        </td>
                        <td></td>
                        <td></td>
                        <td>
                          <TimeInterval toTimestamp={pool.metadata.creationTimestamp} />
                        </td>
                      </tr>
                      {isExpanded
                        ? clusters.map((cluster: TenantClusterPoolStatusCluster, idx: number) => (
                            <ClusterChildRow key={idx} cluster={cluster} namespace={pool.metadata.namespace} />
                          ))
                        : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PageSection>
      )}
      <Footer />
    </div>
  );
};

export default TenantClusterPools;
