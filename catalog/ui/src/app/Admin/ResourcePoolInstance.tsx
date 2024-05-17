import React, { useReducer } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  EmptyState,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Tabs,
  Tab,
  TabTitleText,
  Title,
  Spinner,
} from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import { apiPaths, deleteResourceHandle, deleteResourcePool, fetcher, fetcherItemsInAllPages } from '@app/api';
import { selectedUidsReducer } from '@app/reducers';
import { ResourceHandle, ResourcePool, ResourcePoolList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ResourcePoolMinAvailableInput from './ResourcePoolMinAvailableInput';
import { useErrorHandler } from 'react-error-boundary';
import useSWR from 'swr';
import { BABYLON_DOMAIN, compareK8sObjects, FETCH_BATCH_LIMIT } from '@app/util';
import useMatchMutate from '@app/utils/useMatchMutate';
import usePoolStatus from './usePoolStatus';
import useSession from '@app/utils/useSession';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';

import './admin.css';

function fetchResourceHandlesFromResourcePool(resourcePoolName: string) {
  return fetcherItemsInAllPages((continueId) =>
    apiPaths.RESOURCE_HANDLES({
      labelSelector: `poolboy.gpte.redhat.com/resource-pool-name=${resourcePoolName}`,
      limit: FETCH_BATCH_LIMIT,
      continueId,
    })
  );
}

const ResourcePoolInstanceComponent: React.FC<{ resourcePoolName: string; activeTab: string }> = ({
  resourcePoolName,
  activeTab,
}) => {
  const navigate = useNavigate();
  const { consoleUrl } = useSession().getSession();
  const matchMutate = useMatchMutate();
  const [selectedResourceHandleUids, reduceResourceHandleSelectedUids] = useReducer(selectedUidsReducer, []);

  const {
    data: resourcePool,
    error,
    mutate,
  } = useSWR<ResourcePool>(
    apiPaths.RESOURCE_POOL({
      resourcePoolName,
    }),
    fetcher,
    {
      refreshInterval: 8000,
      compare: compareK8sObjects,
    }
  );
  useErrorHandler(error?.status === 404 ? error : null);

  const { data: resourceHandles, mutate: mutateResourceHandles } = useSWR<ResourceHandle[]>(
    resourcePool
      ? apiPaths.RESOURCE_HANDLES({
          labelSelector: `poolboy.gpte.redhat.com/resource-pool-name=${resourcePoolName}`,
          limit: FETCH_BATCH_LIMIT,
        })
      : null,
    () => fetchResourceHandlesFromResourcePool(resourcePoolName)
  );
  const { total, taken, available } = usePoolStatus(resourceHandles);

  function mutateResourcePoolsList(data: ResourcePoolList) {
    matchMutate([{ name: 'RESOURCE_POOLS', arguments: { limit: FETCH_BATCH_LIMIT }, data }]);
  }

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete ResourcePool ${resourcePoolName}?`)) {
      await deleteResourcePool(resourcePool);
      mutate();
      mutateResourceHandles();
      mutateResourcePoolsList(undefined);
      navigate('/admin/resourcepools');
    }
  }

  async function confirmThenDeleteSelectedHandles(): Promise<void> {
    if (confirm('Delete selected ResourceHandles?')) {
      const updatedResourceHandles: ResourceHandle[] = [];
      for (const resourceHandle of resourceHandles) {
        if (selectedResourceHandleUids.includes(resourceHandle.metadata.uid)) {
          await deleteResourceHandle(resourceHandle);
        } else {
          updatedResourceHandles.push(resourceHandle);
        }
      }
      mutateResourceHandles(updatedResourceHandles);
    }
  }

  return (
    <>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Breadcrumb>
          <BreadcrumbItem
            render={({ className }) => (
              <Link to="/admin/resourcepools" className={className}>
                ResourcePools
              </Link>
            )}
          />
          <BreadcrumbItem>{resourcePoolName}</BreadcrumbItem>
        </Breadcrumb>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              ResourcePool {resourcePoolName}
            </Title>
          </SplitItem>
          <SplitItem>
            <ActionDropdown
              position="right"
              actionDropdownItems={[
                <ActionDropdownItem key="delete" label="Delete ResourcePool" onSelect={confirmThenDelete} />,
                <ActionDropdownItem
                  key="deletedSelectedHandles"
                  isDisabled={selectedResourceHandleUids.length === 0}
                  label="Delete Selected ResourceHandles"
                  onSelect={confirmThenDeleteSelectedHandles}
                />,
                <ActionDropdownItem
                  key="editInOpenShift"
                  label="Edit in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${resourcePool.metadata.namespace}/${resourcePool.apiVersion.replace(
                        '/',
                        '~'
                      )}~${resourcePool.kind}/${resourcePool.metadata.name}/yaml`
                    )
                  }
                />,
                <ActionDropdownItem
                  key="openInOpenShift"
                  label="Open in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${resourcePool.metadata.namespace}/${resourcePool.apiVersion.replace(
                        '/',
                        '~'
                      )}~${resourcePool.kind}/${resourcePool.metadata.name}`
                    )
                  }
                />,
              ]}
            />
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
        <Tabs
          activeKey={activeTab}
          onSelect={(e, tabIndex) => navigate(`/admin/resourcepools/${resourcePoolName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <Stack hasGutter>
              <StackItem>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourcePoolName}
                      <OpenshiftConsoleLink resource={resourcePool} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Description</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourcePool.metadata.annotations?.[`${BABYLON_DOMAIN}/description`] || <p>-</p>}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Created At</DescriptionListTerm>
                    <DescriptionListDescription>
                      <LocalTimestamp timestamp={resourcePool.metadata.creationTimestamp} />
                      <span style={{ padding: '0 6px' }}>
                        (<TimeInterval toTimestamp={resourcePool.metadata.creationTimestamp} />)
                      </span>
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Unclaimed Lifespan</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourcePool.spec.lifespan?.unclaimed || <p>-</p>}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Minimum Available</DescriptionListTerm>
                    <DescriptionListDescription>
                      <ResourcePoolMinAvailableInput
                        resourcePoolName={resourcePoolName}
                        minAvailable={resourcePool.spec.minAvailable}
                        mutateFn={(updatedResourcePool: ResourcePool) => {
                          mutate(updatedResourcePool);
                          mutateResourceHandles(fetchResourceHandlesFromResourcePool(resourcePoolName));
                          mutateResourcePoolsList(undefined);
                        }}
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Total</DescriptionListTerm>
                    <DescriptionListDescription>{total}</DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Available</DescriptionListTerm>
                    <DescriptionListDescription>
                      {available === -1 ? <Spinner key="spinner" isSVG size="md" /> : available}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Taken</DescriptionListTerm>
                    <DescriptionListDescription>{taken}</DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </StackItem>
              {resourcePool.spec.resources.map((resourcePoolSpecResource, idx) => {
                const resourceName = resourcePoolSpecResource.name || resourcePoolSpecResource.provider.name;
                return (
                  <StackItem key={idx}>
                    <Title headingLevel="h3">
                      {resourceName === 'babylon'
                        ? 'Babylon Legacy CloudForms Integration'
                        : `Resource: ${resourceName}`}
                    </Title>
                    <DescriptionList isHorizontal>
                      <DescriptionListGroup>
                        <DescriptionListTerm>ResourceProvider</DescriptionListTerm>
                        <DescriptionListDescription>
                          <Link to={`/admin/resourceproviders/${resourcePoolSpecResource.provider.name}`}>
                            {resourcePoolSpecResource.provider.name}
                          </Link>
                          <OpenshiftConsoleLink reference={resourcePoolSpecResource.provider} />
                        </DescriptionListDescription>
                      </DescriptionListGroup>

                      {resourcePoolSpecResource.template?.spec?.vars?.job_vars ? (
                        <DescriptionListGroup>
                          <DescriptionListTerm>Job Vars</DescriptionListTerm>
                          <DescriptionListDescription style={{ whiteSpace: 'pre-wrap' }}>
                            {yaml.dump(resourcePoolSpecResource.template.spec.vars.job_vars)}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      ) : null}
                    </DescriptionList>
                  </StackItem>
                );
              })}
            </Stack>
          </Tab>
          <Tab eventKey="resourcehandles" title={<TabTitleText>ResourceHandles</TabTitleText>}>
            {resourceHandles.length === 0 ? (
              <EmptyState variant="full">
                <EmptyStateIcon icon={ExclamationTriangleIcon} />
                <Title headingLevel="h1" size="lg">
                  No ResourceHandles found.
                </Title>
              </EmptyState>
            ) : (
              <SelectableTable
                columns={['Name', 'Service Namespace', 'ResourceClaim', 'Created At']}
                onSelectAll={(isSelected: boolean) => {
                  if (isSelected) {
                    reduceResourceHandleSelectedUids({
                      type: 'set',
                      uids: resourceHandles.map((item) => item.metadata.uid),
                    });
                  } else {
                    reduceResourceHandleSelectedUids({
                      type: 'clear',
                    });
                  }
                }}
                rows={resourceHandles.map((resourceHandle: ResourceHandle) => {
                  return {
                    cells: [
                      <>
                        <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.metadata.name}`}>
                          {resourceHandle.metadata.name}
                        </Link>
                        <OpenshiftConsoleLink key="console" resource={resourceHandle} />
                      </>,
                      <>
                        {resourceHandle.spec.resourceClaim ? (
                          [
                            <Link key="admin" to={`/services/${resourceHandle.spec.resourceClaim.namespace}`}>
                              {resourceHandle.spec.resourceClaim.namespace}
                            </Link>,
                            <OpenshiftConsoleLink
                              key="console"
                              reference={resourceHandle.spec.resourceClaim}
                              linkToNamespace={true}
                            />,
                          ]
                        ) : (
                          <p>-</p>
                        )}
                      </>,
                      <>
                        {resourceHandle.spec.resourceClaim ? (
                          [
                            <Link
                              key="admin"
                              to={`/services/${resourceHandle.spec.resourceClaim.namespace}/${resourceHandle.spec.resourceClaim.name}`}
                            >
                              {resourceHandle.spec.resourceClaim.name}
                            </Link>,
                            <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourceClaim} />,
                          ]
                        ) : (
                          <p>-</p>
                        )}
                      </>,
                      <>
                        <LocalTimestamp key="timestamp" timestamp={resourceHandle.metadata.creationTimestamp} />
                        <span key="interval" style={{ padding: '0 6px' }}>
                          (<TimeInterval key="time-interval" toTimestamp={resourceHandle.metadata.creationTimestamp} />)
                        </span>
                      </>,
                    ],
                    onSelect: (isSelected: boolean) =>
                      reduceResourceHandleSelectedUids({
                        type: isSelected ? 'add' : 'remove',
                        uids: [resourceHandle.metadata.uid],
                      }),
                    selected: selectedResourceHandleUids.includes(resourceHandle.metadata.uid),
                  };
                })}
              />
            )}
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <Editor
              height="500px"
              language="yaml"
              options={{ readOnly: true }}
              theme="vs-dark"
              value={yaml.dump(resourcePool)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const ResourcePoolInstance: React.FC = () => {
  const { name: resourcePoolName, tab: activeTab = 'details' } = useParams();
  return (
    <ErrorBoundaryPage name={resourcePoolName} type="ResourcePool">
      <ResourcePoolInstanceComponent activeTab={activeTab} resourcePoolName={resourcePoolName} />
    </ErrorBoundaryPage>
  );
};

export default ResourcePoolInstance;
