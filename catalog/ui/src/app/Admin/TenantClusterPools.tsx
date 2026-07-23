import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Button,
  EmptyState,
  Form,
  FormGroup,
  Label,
  NumberInput,
  PageSection,
  Split,
  SplitItem,
  TextInput,
  Title,
} from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import AngleRightIcon from '@patternfly/react-icons/dist/js/icons/angle-right-icon';
import AngleDownIcon from '@patternfly/react-icons/dist/js/icons/angle-down-icon';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import { apiPaths, createTenantClusterPool, deleteTenantClusterPool, fetcherItemsInAllPages, silentFetcher } from '@app/api';
import { CatalogItem, TenantClusterPool, TenantClusterPoolStatusCluster } from '@app/types';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import TimeInterval from '@app/components/TimeInterval';
import { BABYLON_DOMAIN, compareK8sObjectsArr, displayName, FETCH_BATCH_LIMIT } from '@app/util';
import CatalogItemSelectorModal from '@app/MultiWorkshops/CatalogItemSelectorModal';
import Modal, { useModal } from '@app/Modal/Modal';
import useSWR from 'swr';
import Footer from '@app/components/Footer';

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

const ClusterPlacementsCell: React.FC<{ clusterName: string }> = ({ clusterName }) => {
  const { data: placementsData } = useSWR(
    clusterName ? apiPaths.SANDBOX_CLUSTER_PLACEMENTS({ clusterName }) : null,
    silentFetcher,
    { shouldRetryOnError: false, suspense: false },
  );
  const { data: configData } = useSWR(
    clusterName ? apiPaths.SANDBOX_CLUSTER_CONFIG({ clusterName }) : null,
    silentFetcher,
    { shouldRetryOnError: false, suspense: false },
  );
  const count = placementsData?.placements?.length ?? 0;
  const max = configData?.max_placements;
  if (!placementsData?.placements && !configData) return <span className="tenant-pools-muted">-</span>;
  if (max != null) return <span>{count} / {max}</span>;
  return <span>{count}</span>;
};

const ClusterSandboxApiCell: React.FC<{ clusterName: string }> = ({ clusterName }) => {
  const { data } = useSWR(
    clusterName ? apiPaths.SANDBOX_CLUSTER_PLACEMENTS({ clusterName }) : null,
    silentFetcher,
    { shouldRetryOnError: false, suspense: false },
  );
  if (data === undefined) return <span className="tenant-pools-muted">-</span>;
  if (data?.placements) {
    return (
      <span className="tenant-pools-onboarded">
        <CheckCircleIcon /> Onboarded
      </span>
    );
  }
  return <span className="tenant-pools-not-onboarded">Not onboarded</span>;
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

const CreateTenantClusterPoolForm: React.FC<{
  setOnConfirmCb?: React.Dispatch<React.SetStateAction<() => Promise<void>>>;
  onCreated: (pool: TenantClusterPool) => void;
}> = ({ setOnConfirmCb, onCreated }) => {
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null);
  const [isCatalogSelectorOpen, setIsCatalogSelectorOpen] = useState(false);
  const [minClusters, setMinClusters] = useState(0);
  const [maxClusters, setMaxClusters] = useState(0);
  const [minAvailableSandboxPlacements, setMinAvailableSandboxPlacements] = useState(0);

  const catalogItemName = selectedCatalogItem?.metadata?.name || '';

  useEffect(() => {
    if (!setOnConfirmCb) return;
    setOnConfirmCb(() => async () => {
      if (!catalogItemName) throw new Error('Please select a catalog item');
      const definition: TenantClusterPool = {
        apiVersion: `${BABYLON_DOMAIN}/v1`,
        kind: 'TenantClusterPool',
        metadata: {
          name: catalogItemName,
          namespace: 'shared-clusters',
        },
        spec: {
          clusterProvisioning: {
            provider: { name: catalogItemName },
          },
          minClusters,
          maxClusters,
          minAvailableSandboxPlacements,
        },
      };
      const created = await createTenantClusterPool(definition);
      onCreated(created);
    });
  }, [catalogItemName, minClusters, maxClusters, minAvailableSandboxPlacements, onCreated, setOnConfirmCb]);

  return (
    <>
      <CatalogItemSelectorModal
        isOpen={isCatalogSelectorOpen}
        onClose={() => setIsCatalogSelectorOpen(false)}
        onSelect={(item) => {
          const selected = Array.isArray(item) ? item[0] : item;
          if (selected) setSelectedCatalogItem(selected);
        }}
        title="Select Catalog Item"
        singleSelect
      />
      <Form>
        <FormGroup label="Catalog Item" isRequired fieldId="tcp-catalog-item">
          <Split hasGutter>
            <SplitItem isFilled>
              <TextInput
                id="tcp-catalog-item"
                readOnly
                value={selectedCatalogItem ? displayName(selectedCatalogItem) : ''}
                placeholder="Select a catalog item..."
              />
            </SplitItem>
            <SplitItem>
              <Button variant="secondary" onClick={() => setIsCatalogSelectorOpen(true)}>
                Browse Catalog
              </Button>
            </SplitItem>
          </Split>
        </FormGroup>
        {catalogItemName ? (
          <FormGroup label="Name / Provider" fieldId="tcp-name">
            <TextInput id="tcp-name" readOnly value={catalogItemName} />
          </FormGroup>
        ) : null}
        <FormGroup label="Min Clusters" fieldId="tcp-min-clusters">
          <NumberInput
            id="tcp-min-clusters"
            value={minClusters}
            min={0}
            onMinus={() => setMinClusters(Math.max(0, minClusters - 1))}
            onPlus={() => setMinClusters(minClusters + 1)}
            onChange={(event: React.FormEvent<HTMLInputElement>) => {
              const val = parseInt((event.target as HTMLInputElement).value, 10);
              if (!isNaN(val) && val >= 0) setMinClusters(val);
            }}
          />
        </FormGroup>
        <FormGroup label="Max Clusters" fieldId="tcp-max-clusters">
          <NumberInput
            id="tcp-max-clusters"
            value={maxClusters}
            min={0}
            onMinus={() => setMaxClusters(Math.max(0, maxClusters - 1))}
            onPlus={() => setMaxClusters(maxClusters + 1)}
            onChange={(event: React.FormEvent<HTMLInputElement>) => {
              const val = parseInt((event.target as HTMLInputElement).value, 10);
              if (!isNaN(val) && val >= 0) setMaxClusters(val);
            }}
          />
        </FormGroup>
        <FormGroup label="Min Available Sandbox Placements" fieldId="tcp-min-placements">
          <NumberInput
            id="tcp-min-placements"
            value={minAvailableSandboxPlacements}
            min={0}
            onMinus={() => setMinAvailableSandboxPlacements(Math.max(0, minAvailableSandboxPlacements - 1))}
            onPlus={() => setMinAvailableSandboxPlacements(minAvailableSandboxPlacements + 1)}
            onChange={(event: React.FormEvent<HTMLInputElement>) => {
              const val = parseInt((event.target as HTMLInputElement).value, 10);
              if (!isNaN(val) && val >= 0) setMinAvailableSandboxPlacements(val);
            }}
          />
        </FormGroup>
      </Form>
    </>
  );
};

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
  const [createModal, openCreateModal] = useModal();
  const [deleteModal, openDeleteModal] = useModal();
  const [poolToDelete, setPoolToDelete] = useState<TenantClusterPool | null>(null);
  const [expandedPools, setExpandedPools] = useState<Set<string>>(new Set());

  const { data: tenantClusterPools, mutate } = useSWR<TenantClusterPool[]>(
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

  const showDeleteModal = useCallback(
    (pool: TenantClusterPool) => {
      setPoolToDelete(pool);
      openDeleteModal();
    },
    [openDeleteModal],
  );

  return (
    <div className="admin-container">
      <Modal
        ref={createModal}
        title="Create Tenant Cluster Pool"
        onConfirm={() => {}}
        passModifiers
        confirmText="Create"
      >
        <CreateTenantClusterPoolForm
          onCreated={(created) => {
            mutate((prev) => [...(prev || []), created], false);
          }}
        />
      </Modal>
      <Modal
        ref={deleteModal}
        title={`Delete TenantClusterPool ${poolToDelete?.metadata.name}?`}
        onConfirm={async () => {
          if (!poolToDelete) return;
          await deleteTenantClusterPool(poolToDelete);
          mutate(
            (prev) => (prev || []).filter((p) => p.metadata.uid !== poolToDelete.metadata.uid),
            false,
          );
          setPoolToDelete(null);
        }}
        confirmText="Delete"
      >
        <p>This will permanently delete the TenantClusterPool and its managed clusters.</p>
      </Modal>
      <PageSection hasBodyWrapper={false} key="header" className="admin-header">
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Tenant Cluster Pools
            </Title>
          </SplitItem>
          <SplitItem>
            <Button variant="primary" onClick={openCreateModal}>
              Create Tenant Cluster Pool
            </Button>
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
                  <th>Placements</th>
                  <th>Sandbox API State</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPools.map((pool) => {
                  const poolKey = `${pool.metadata.namespace}/${pool.metadata.name}`;
                  const isExpanded = expandedPools.has(poolKey);
                  const clusters = pool.status?.clusters || [];
                  const clusterCount = clusters.length;
                  const availableCount = clusters.filter((c) => c.sandboxApiState === 'available').length;

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
                        <td></td>
                        <td></td>
                        <td>
                          <TimeInterval toTimestamp={pool.metadata.creationTimestamp} />
                        </td>
                        <td>
                          <Button
                            variant="plain"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              showDeleteModal(pool);
                            }}
                            aria-label={`Delete ${pool.metadata.name}`}
                          >
                            <TrashIcon />
                          </Button>
                        </td>
                      </tr>
                      {isExpanded
                        ? clusters.map((cluster: TenantClusterPoolStatusCluster, idx: number) => {
                            const clusterName = cluster.resourceClaimName.replace(/\./g, '-');
                            return (
                              <tr key={idx} className="tenant-pools-child-row">
                                <td></td>
                                <td>
                                  <Link
                                    to={`/services/${pool.metadata.namespace}/${cluster.resourceClaimName}`}
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
                                <td>
                                  <ClusterPlacementsCell clusterName={clusterName} />
                                </td>
                                <td>
                                  <ClusterSandboxApiCell clusterName={clusterName} />
                                </td>
                                <td></td>
                                <td></td>
                              </tr>
                            );
                          })
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
