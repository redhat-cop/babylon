import React, { useEffect, useReducer, useRef } from 'react';
import { Link, useHistory, useRouteMatch } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Breadcrumb,
  BreadcrumbItem,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  EmptyState,
  EmptyStateBody,
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
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';

import { deleteResourceHandle, deleteResourcePool, getResourcePool, listResourceHandles } from '@app/api';

import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { selectConsoleURL } from '@app/store';
import { ResourceHandle, ResourceHandleList, ResourcePool } from '@app/types';

import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ResourcePoolMinAvailableInput from './ResourcePoolMinAvailableInput';

import './admin.css';

interface RouteMatchParams {
  name: string;
  tab?: string;
}

const ResourcePoolInstance: React.FunctionComponent = () => {
  const history = useHistory();
  const consoleURL = useSelector(selectConsoleURL);
  const componentWillUnmount = useRef(false);
  const routeMatch = useRouteMatch<RouteMatchParams>('/admin/resourcepools/:name/:tab?');
  const resourcePoolName = routeMatch.params.name;
  const activeTab = routeMatch.params.tab || 'details';

  const [resourceHandlesFetchState, reduceResourceHandlesFetchState] = useReducer(k8sFetchStateReducer, null);
  const [resourcePoolFetchState, reduceResourcePoolFetchState] = useReducer(k8sFetchStateReducer, null);
  const [selectedResourceHandleUids, reduceResourceHandleSelectedUids] = useReducer(selectedUidsReducer, []);

  const resourceHandles = (resourceHandlesFetchState?.items as ResourceHandle[]) || [];
  const resourcePool: ResourcePool | null = resourcePoolFetchState?.item as ResourcePool | null;

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete ResourcePool ${resourcePoolName}?`)) {
      await deleteResourcePool(resourcePool);
      history.push('/admin/resourcepools');
    }
  }

  async function confirmThenDeleteSelectedHandles(): Promise<void> {
    if (confirm('Delete selected ResourceHandles?')) {
      const removedResourceHandles: ResourceHandle[] = [];
      for (const resourceHandle of resourceHandles) {
        if (selectedResourceHandleUids.includes(resourceHandle.metadata.uid)) {
          await deleteResourceHandle(resourceHandle);
          removedResourceHandles.push(resourceHandle);
        }
      }
      reduceResourceHandleSelectedUids({ type: 'clear' });
      reduceResourceHandlesFetchState({ type: 'removeItems', items: removedResourceHandles });
    }
  }

  async function fetchResourceHandles(): Promise<void> {
    const resourceHandleList: ResourceHandleList = await listResourceHandles({
      labelSelector: `poolboy.gpte.redhat.com/resource-pool-name=${resourcePoolName}`,
    });
    if (!resourceHandlesFetchState.activity.canceled) {
      reduceResourceHandlesFetchState({
        type: 'post',
        k8sObjectList: resourceHandleList,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceResourceHandlesFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  async function fetchResourcePool(): Promise<void> {
    let resourcePool: ResourcePool = null;
    try {
      resourcePool = await getResourcePool(resourcePoolName);
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 404) {
        throw error;
      }
    }
    if (!resourcePoolFetchState.activity.canceled) {
      reduceResourcePoolFetchState({
        type: 'post',
        item: resourcePool,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceResourcePoolFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  // First render and detect unmount
  useEffect(() => {
    reduceResourceHandlesFetchState({ type: 'startFetch' });
    reduceResourcePoolFetchState({ type: 'startFetch' });
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  useEffect(() => {
    if (resourceHandlesFetchState?.canContinue) {
      fetchResourceHandles();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(resourceHandlesFetchState);
      }
    };
  }, [resourceHandlesFetchState]);

  useEffect(() => {
    if (resourcePoolFetchState?.canContinue) {
      fetchResourcePool();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(resourcePoolFetchState);
      }
    };
  }, [resourcePoolFetchState]);

  if (!resourcePool) {
    if (resourcePoolFetchState?.finished) {
      return (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              ResourcePool not found
            </Title>
            <EmptyStateBody>ResourcePool {resourcePoolName} was not found.</EmptyStateBody>
          </EmptyState>
        </PageSection>
      );
    } else {
      return (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={LoadingIcon} />
          </EmptyState>
        </PageSection>
      );
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
          <BreadcrumbItem>{resourcePool.metadata.name}</BreadcrumbItem>
        </Breadcrumb>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              ResourcePool {resourcePool.metadata.name}
            </Title>
          </SplitItem>
          <SplitItem>
            <ActionDropdown
              position="right"
              actionDropdownItems={[
                <ActionDropdownItem key="delete" label="Delete" onSelect={() => confirmThenDelete()} />,
                <ActionDropdownItem
                  key="deletedSelectedHandles"
                  isDisabled={selectedResourceHandleUids.length === 0}
                  label="Delete Selected ResourceHandles"
                  onSelect={() => confirmThenDeleteSelectedHandles()}
                />,
                <ActionDropdownItem
                  key="editInOpenShift"
                  label="Edit in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleURL}/k8s/ns/${resourcePool.metadata.namespace}/${resourcePool.apiVersion.replace(
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
                      `${consoleURL}/k8s/ns/${resourcePool.metadata.namespace}/${resourcePool.apiVersion.replace(
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
          onSelect={(e, tabIndex) => history.push(`/admin/resourcepools/${resourcePoolName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <Stack hasGutter>
              <StackItem>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourcePool.metadata.name}
                      <OpenshiftConsoleLink resource={resourcePool} />
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
                    <DescriptionListTerm>Minimum Available</DescriptionListTerm>
                    <DescriptionListDescription>
                      <ResourcePoolMinAvailableInput resourcePool={resourcePool} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Default Lifespan</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourcePool.spec.lifespan?.default || <p>-</p>}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Maximum Lifespan</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourcePool.spec.lifespan?.maximum || <p>-</p>}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Relative Maximum Lifespan</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourcePool.spec.lifespan?.relativeMaximum || <p>-</p>}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Unclaimed Handle Lifespan</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourcePool.spec.lifespan?.unclaimed || <p>-</p>}
                    </DescriptionListDescription>
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
                        : `Resource ${resourceName}`}
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
                    </DescriptionList>
                  </StackItem>
                );
              })}
            </Stack>
          </Tab>
          <Tab eventKey="resourcehandles" title={<TabTitleText>ResourceHandles</TabTitleText>}>
            {resourceHandles.length === 0 ? (
              resourceHandlesFetchState?.finished ? (
                <EmptyState variant="full">
                  <EmptyStateIcon icon={ExclamationTriangleIcon} />
                  <Title headingLevel="h1" size="lg">
                    No ResourceHandles found.
                  </Title>
                </EmptyState>
              ) : (
                <EmptyState variant="full">
                  <EmptyStateIcon icon={LoadingIcon} />
                </EmptyState>
              )
            ) : (
              <SelectableTable
                columns={['Name', 'Service Namespace', 'ResourceClaim', 'Created At']}
                onSelectAll={(isSelected) => {
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
                    onSelect: (isSelected) =>
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

export default ResourcePoolInstance;
