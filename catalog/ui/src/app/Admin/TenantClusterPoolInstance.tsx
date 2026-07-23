import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  EmptyState,
  Label,
  NumberInput,
  PageSection,
  Spinner,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Tabs,
  Tab,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import Editor from '@monaco-editor/react';
import * as yaml from 'js-yaml';
import { apiPaths, deleteTenantClusterPool, fetcher, patchTenantClusterPool } from '@app/api';
import { TenantClusterPool } from '@app/types';
import { KeyedMutator } from 'swr';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import { useErrorBoundary } from 'react-error-boundary';
import useSWR from 'swr';
import { BABYLON_DOMAIN, compareK8sObjects } from '@app/util';
import useSession from '@app/utils/useSession';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';

import './admin.css';

function sandboxApiStateColor(state: string): 'green' | 'yellow' | 'red' | 'grey' {
  switch (state) {
    case 'available':
      return 'green';
    case 'pending':
      return 'yellow';
    case 'disabled':
      return 'red';
    case 'removed':
      return 'grey';
    default:
      return 'grey';
  }
}

const TenantClusterPoolNumberInput: React.FC<{
  namespace: string;
  name: string;
  specField: string;
  value: number;
  min?: number;
  max?: number;
  mutate: KeyedMutator<TenantClusterPool>;
}> = ({ namespace, name, specField, value: defaultValue, min = 0, max = 999, mutate }) => {
  const [value, setValue] = useState(defaultValue);
  const [timeout, setInputTimeout] = useState<ReturnType<typeof setTimeout>>(null);
  const [updating, setUpdating] = useState(false);

  function handleInputChange(event: React.FormEvent<HTMLInputElement>) {
    const n = parseInt(event.currentTarget.value);
    if (isNaN(n)) return;
    queueUpdate(Math.max(min, Math.min(max, n)));
  }

  function queueUpdate(n: number) {
    setValue(n);
    if (timeout) clearTimeout(timeout);
    setInputTimeout(
      setTimeout(async (val: number) => {
        setUpdating(true);
        const updated = await patchTenantClusterPool(namespace, name, { spec: { [specField]: val } });
        setUpdating(false);
        mutate(updated);
      }, 1000, n),
    );
  }

  return (
    <>
      <NumberInput
        min={min}
        max={max}
        onChange={handleInputChange}
        onMinus={() => queueUpdate(Math.max(min, value - 1))}
        onPlus={() => queueUpdate(Math.min(max, value + 1))}
        value={value}
      />
      {updating ? [' ', <Spinner key="spinner" size="md" />] : null}
    </>
  );
};

const TenantClusterPoolInstanceComponent: React.FC<{
  tenantClusterPoolName: string;
  tenantClusterPoolNamespace: string;
  activeTab: string;
}> = ({ tenantClusterPoolName, tenantClusterPoolNamespace, activeTab }) => {
  const navigate = useNavigate();
  const { consoleUrl } = useSession().getSession();

  const {
    data: tenantClusterPool,
    error,
    mutate,
  } = useSWR<TenantClusterPool>(
    apiPaths.TENANT_CLUSTER_POOL({
      namespace: tenantClusterPoolNamespace,
      tenantClusterPoolName,
    }),
    fetcher,
    {
      refreshInterval: 8000,
      compare: compareK8sObjects,
    },
  );
  const { showBoundary } = useErrorBoundary();
  useEffect(() => {
    if (error?.status === 404) {
      showBoundary(error);
    }
  }, [error, showBoundary]);

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete TenantClusterPool ${tenantClusterPoolName}?`)) {
      await deleteTenantClusterPool(tenantClusterPool);
      mutate();
      navigate('/admin/tenantclusterpools');
    }
  }

  const clusters = tenantClusterPool?.status?.clusters || [];
  const spec = tenantClusterPool?.spec;

  return (
    <>
      <PageSection hasBodyWrapper={false} key="header" className="admin-header">
        <Breadcrumb>
          <BreadcrumbItem
            render={({ className }) => (
              <Link to="/admin/tenantclusterpools" className={className}>
                Tenant Cluster Pools
              </Link>
            )}
          />
          <BreadcrumbItem>{tenantClusterPoolName}</BreadcrumbItem>
        </Breadcrumb>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              TenantClusterPool {tenantClusterPoolName}
            </Title>
          </SplitItem>
          <SplitItem>
            <ActionDropdown
              position="right"
              actionDropdownItems={[
                <ActionDropdownItem key="delete" label="Delete TenantClusterPool" onSelect={confirmThenDelete} />,
                <ActionDropdownItem
                  key="editInOpenShift"
                  label="Edit in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${tenantClusterPool.metadata.namespace}/${tenantClusterPool.apiVersion.replace(
                        '/',
                        '~',
                      )}~${tenantClusterPool.kind}/${tenantClusterPool.metadata.name}/yaml`,
                    )
                  }
                />,
                <ActionDropdownItem
                  key="openInOpenShift"
                  label="Open in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${tenantClusterPool.metadata.namespace}/${tenantClusterPool.apiVersion.replace(
                        '/',
                        '~',
                      )}~${tenantClusterPool.kind}/${tenantClusterPool.metadata.name}`,
                    )
                  }
                />,
              ]}
            />
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection hasBodyWrapper={false} key="body" className="admin-body">
        <Tabs
          activeKey={activeTab}
          onSelect={(_e, tabIndex) =>
            navigate(`/admin/tenantclusterpools/${tenantClusterPoolNamespace}/${tenantClusterPoolName}/${tabIndex}`)
          }
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <Stack hasGutter>
              <StackItem>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      {tenantClusterPoolName}
                      <OpenshiftConsoleLink resource={tenantClusterPool} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Namespace</DescriptionListTerm>
                    <DescriptionListDescription>{tenantClusterPoolNamespace}</DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Created At</DescriptionListTerm>
                    <DescriptionListDescription>
                      <LocalTimestamp timestamp={tenantClusterPool.metadata.creationTimestamp} />
                      <span style={{ padding: '0 6px' }}>
                        (<TimeInterval toTimestamp={tenantClusterPool.metadata.creationTimestamp} />)
                      </span>
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Resource Provider</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Link to={`/admin/resourceproviders/${spec?.clusterProvisioning?.provider?.name}`}>
                        {spec?.clusterProvisioning?.provider?.name}
                      </Link>
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Min Clusters</DescriptionListTerm>
                    <DescriptionListDescription>
                      <TenantClusterPoolNumberInput
                        namespace={tenantClusterPoolNamespace}
                        name={tenantClusterPoolName}
                        specField="minClusters"
                        value={spec?.minClusters ?? 0}
                        mutate={mutate}
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Max Clusters</DescriptionListTerm>
                    <DescriptionListDescription>
                      <TenantClusterPoolNumberInput
                        namespace={tenantClusterPoolNamespace}
                        name={tenantClusterPoolName}
                        specField="maxClusters"
                        value={spec?.maxClusters ?? 0}
                        mutate={mutate}
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Min Available Sandbox Placements</DescriptionListTerm>
                    <DescriptionListDescription>
                      <TenantClusterPoolNumberInput
                        namespace={tenantClusterPoolNamespace}
                        name={tenantClusterPoolName}
                        specField="minAvailableSandboxPlacements"
                        value={spec?.minAvailableSandboxPlacements ?? 0}
                        mutate={mutate}
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Total Clusters</DescriptionListTerm>
                    <DescriptionListDescription>{clusters.length}</DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </StackItem>

              <StackItem>
                <Title headingLevel="h3">Sandbox Host Configuration</Title>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Max Placements</DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.sandboxHost?.max_placements ?? '-'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Max CPU Usage %</DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.sandboxHost?.max_cpu_usage_percentage ?? 100}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Max Memory Usage %</DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.sandboxHost?.max_memory_usage_percentage ?? 90}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Quota Required</DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.sandboxHost?.quota_required ? 'Yes' : 'No'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </StackItem>

              {spec?.tenantPools?.length > 0 ? (
                <StackItem>
                  <Title headingLevel="h3">Tenant Pools</Title>
                  {spec.tenantPools.map((pool, idx) => (
                    <DescriptionList isHorizontal key={idx}>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Provider</DescriptionListTerm>
                        <DescriptionListDescription>
                          <Link to={`/admin/resourceproviders/${pool.provider.name}`}>{pool.provider.name}</Link>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Min Available</DescriptionListTerm>
                        <DescriptionListDescription>{pool.minAvailable ?? '-'}</DescriptionListDescription>
                      </DescriptionListGroup>
                    </DescriptionList>
                  ))}
                </StackItem>
              ) : null}
            </Stack>
          </Tab>

          <Tab eventKey="clusters" title={<TabTitleText>Clusters ({clusters.length})</TabTitleText>}>
            {clusters.length === 0 ? (
              <EmptyState
                headingLevel="h1"
                icon={ExclamationTriangleIcon}
                titleText="No clusters found."
                variant="full"
              />
            ) : (
              <Table aria-label="Clusters" variant="compact">
                <Thead>
                  <Tr>
                    <Th>ResourceClaim</Th>
                    <Th>Sandbox API State</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {clusters.map((cluster, idx) => (
                    <Tr key={idx}>
                      <Td dataLabel="ResourceClaim">
                        <Link to={`/services/${tenantClusterPoolNamespace}/${cluster.resourceClaimName}`}>
                          {cluster.resourceClaimName}
                        </Link>
                      </Td>
                      <Td dataLabel="Sandbox API State">
                        <Label isCompact color={sandboxApiStateColor(cluster.sandboxApiState)}>
                          {cluster.sandboxApiState}
                        </Label>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Tab>

          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <Editor
              height="500px"
              language="yaml"
              options={{ readOnly: true }}
              theme="vs-dark"
              value={yaml.dump(tenantClusterPool)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const TenantClusterPoolInstance: React.FC = () => {
  const { namespace: tenantClusterPoolNamespace, name: tenantClusterPoolName, tab: activeTab = 'details' } = useParams();
  return (
    <ErrorBoundaryPage name={tenantClusterPoolName} type="TenantClusterPool">
      <TenantClusterPoolInstanceComponent
        activeTab={activeTab}
        tenantClusterPoolName={tenantClusterPoolName}
        tenantClusterPoolNamespace={tenantClusterPoolNamespace}
      />
    </ErrorBoundaryPage>
  );
};

export default TenantClusterPoolInstance;
