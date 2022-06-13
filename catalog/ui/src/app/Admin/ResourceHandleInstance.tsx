import React from 'react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Link, useHistory, useRouteMatch } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
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
  TextInput,
  Title,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';

import { deleteResourceHandle, getResourceClaim, getResourceHandle } from '@app/api';
import { BABYLON_DOMAIN } from '@app/util';

import { K8sFetchState, cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { selectConsoleURL } from '@app/store';
import { ResourceClaim, ResourceHandle } from '@app/types';

import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';

import CreateResourcePoolFromResourceHandleModal from './CreateResourcePoolFromResourceHandleModal';

import './admin.css';

interface RouteMatchParams {
  name: string;
  tab?: string;
}

const ResourceHandleInstance: React.FunctionComponent = () => {
  const history = useHistory();
  const consoleURL = useSelector(selectConsoleURL);
  const componentWillUnmount = useRef(false);
  const routeMatch = useRouteMatch<RouteMatchParams>('/admin/resourcehandles/:name/:tab?');
  const resourceHandleName = routeMatch.params.name;
  const activeTab = routeMatch.params.tab || 'details';

  const [createResourcePoolFromResourceHandleModalIsOpen, setCreateResourcePoolFromResourceHandleModalIsOpen] =
    useState(false);
  const [resourceClaimFetchState, reduceResourceClaimFetchState] = useReducer(k8sFetchStateReducer, null);
  const [resourceHandleFetchState, reduceResourceHandleFetchState] = useReducer(k8sFetchStateReducer, null);

  const resourceClaim: ResourceClaim | null = resourceClaimFetchState?.item as ResourceClaim | null;
  const resourceHandle: ResourceHandle | null = resourceHandleFetchState?.item as ResourceHandle | null;

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete ResourceHandle ${resourceHandleName}?`)) {
      await deleteResourceHandle(resourceHandle);
      history.push('/admin/resourcehandles');
    }
  }

  async function fetchResourceClaim(): Promise<void> {
    let resourceClaim: ResourceClaim = null;
    try {
      resourceClaim = await getResourceClaim(
        resourceHandle.spec.resourceClaim.namespace,
        resourceHandle.spec.resourceClaim.name
      );
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 404) {
        throw error;
      }
    }
    if (!resourceClaimFetchState.activity.canceled) {
      reduceResourceClaimFetchState({
        type: 'post',
        item: resourceClaim,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceResourceClaimFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  async function fetchResourceHandle(): Promise<void> {
    let resourceHandle: ResourceHandle = null;
    try {
      resourceHandle = await getResourceHandle(resourceHandleName);
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 404) {
        throw error;
      }
    }
    if (!resourceHandleFetchState.activity.canceled) {
      reduceResourceHandleFetchState({
        type: 'post',
        item: resourceHandle,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceResourceHandleFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  // First render and detect unmount
  useEffect(() => {
    reduceResourceHandleFetchState({ type: 'startFetch' });
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Start fetching ResourceClaim when it is defined
  useEffect(() => {
    if (resourceHandle?.spec.resourceClaim?.namespace && resourceHandle?.spec.resourceClaim?.name) {
      reduceResourceClaimFetchState({ type: 'startFetch' });
    }
  }, [resourceHandle?.spec.resourceClaim?.namespace, resourceHandle?.spec.resourceClaim?.name]);

  useEffect(() => {
    if (resourceClaimFetchState?.canContinue) {
      fetchResourceClaim();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(resourceClaimFetchState);
      }
    };
  }, [resourceClaimFetchState]);

  useEffect(() => {
    if (resourceHandleFetchState?.canContinue) {
      fetchResourceHandle();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(resourceHandleFetchState);
      }
    };
  }, [resourceHandleFetchState]);

  if (!resourceHandle) {
    if (resourceHandleFetchState?.finished) {
      return (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              ResourceHandle not found
            </Title>
            <EmptyStateBody>ResourceHandle {resourceHandleName} was not found.</EmptyStateBody>
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
      {createResourcePoolFromResourceHandleModalIsOpen ? (
        <CreateResourcePoolFromResourceHandleModal
          key="createResourcePoolModal"
          isOpen
          onClose={() => setCreateResourcePoolFromResourceHandleModalIsOpen(false)}
          resourceClaim={resourceClaim}
          resourceHandle={resourceHandle}
        />
      ) : null}
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Breadcrumb>
          <BreadcrumbItem
            render={({ className }) => (
              <Link to="/admin/resourcehandles" className={className}>
                ResourceHandles
              </Link>
            )}
          />
          <BreadcrumbItem>{resourceHandle.metadata.name}</BreadcrumbItem>
        </Breadcrumb>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              ResourceHandle {resourceHandle.metadata.name}
            </Title>
          </SplitItem>
          <SplitItem>
            <ActionDropdown
              position="right"
              actionDropdownItems={[
                <ActionDropdownItem key="delete" label="Delete" onSelect={() => confirmThenDelete()} />,
                <ActionDropdownItem
                  key="editInOpenShift"
                  label="Edit in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleURL}/k8s/ns/${resourceHandle.metadata.namespace}/${resourceHandle.apiVersion.replace(
                        '/',
                        '~'
                      )}~${resourceHandle.kind}/${resourceHandle.metadata.name}/yaml`
                    )
                  }
                />,
                <ActionDropdownItem
                  key="createResourcePool"
                  isDisabled={
                    resourceHandle.spec.resourcePool
                      ? true
                      : resourceHandle.spec.resources.find(
                          (resource) => resource.provider.name === 'babylon-user-configmap'
                        )
                      ? true
                      : false
                  }
                  label="Create ResourcePool from ResourceHandle"
                  onSelect={() => setCreateResourcePoolFromResourceHandleModalIsOpen(true)}
                />,
                <ActionDropdownItem
                  key="openInOpenShift"
                  label="Open in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleURL}/k8s/ns/${resourceHandle.metadata.namespace}/${resourceHandle.apiVersion.replace(
                        '/',
                        '~'
                      )}~${resourceHandle.kind}/${resourceHandle.metadata.name}`
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
          onSelect={(e, tabIndex) => history.push(`/admin/resourcehandles/${resourceHandleName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <Stack hasGutter>
              <StackItem>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourceHandle.metadata.name}
                      <OpenshiftConsoleLink resource={resourceHandle} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Created At</DescriptionListTerm>
                    <DescriptionListDescription>
                      <LocalTimestamp timestamp={resourceHandle.metadata.creationTimestamp} /> (
                      <TimeInterval toTimestamp={resourceHandle.metadata.creationTimestamp} />)
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </StackItem>
              {resourceHandle.spec.resourceClaim ? (
                <StackItem>
                  <Title headingLevel="h3">ResourceClaim</Title>
                  <DescriptionList isHorizontal>
                    <DescriptionListGroup key="name">
                      <DescriptionListTerm>Name</DescriptionListTerm>
                      <DescriptionListDescription>
                        <Link
                          to={`/services/${resourceHandle.spec.resourceClaim.namespace}/${resourceHandle.spec.resourceClaim.name}`}
                        >
                          {resourceHandle.spec.resourceClaim.name}
                        </Link>
                        <OpenshiftConsoleLink reference={resourceHandle.spec.resourceClaim} />
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup key="serviceNamespace">
                      <DescriptionListTerm>Service Namespace</DescriptionListTerm>
                      <DescriptionListDescription>
                        {resourceHandle.spec.resourceClaim ? (
                          <>
                            <Link key="service" to={`/services/${resourceHandle.spec.resourceClaim.namespace}`}>
                              {resourceHandle.spec.resourceClaim.namespace}
                            </Link>
                            <OpenshiftConsoleLink
                              key="console"
                              reference={resourceHandle.spec.resourceClaim}
                              linkToNamespace={true}
                            />
                          </>
                        ) : (
                          '-'
                        )}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup key="resourceClaimCreated">
                      <DescriptionListTerm>Created At</DescriptionListTerm>
                      <DescriptionListDescription>
                        {resourceClaim ? (
                          <>
                            <LocalTimestamp timestamp={resourceClaim.metadata.creationTimestamp} /> (
                            <TimeInterval toTimestamp={resourceClaim.metadata.creationTimestamp} />)
                          </>
                        ) : (
                          '-'
                        )}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    {resourceClaim?.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`] ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>CatalogItem</DescriptionListTerm>
                        <DescriptionListDescription>
                          <Link
                            to={`/catalog/item/${
                              resourceClaim?.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemNamespace`]
                            }/${resourceClaim?.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`]}`}
                          >
                            {resourceClaim?.metadata.annotations?.[`${BABYLON_DOMAIN}/catalogItemDisplayName`]}
                          </Link>
                          <OpenshiftConsoleLink
                            reference={{
                              apiVersion: `${BABYLON_DOMAIN}/v1`,
                              kind: 'CatalogItem',
                              name: resourceClaim?.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`],
                              namespace: resourceClaim?.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemNamespace`],
                            }}
                          />
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    ) : null}
                    {resourceClaim?.metadata.annotations?.[`${BABYLON_DOMAIN}/externalPlatformUrl`] ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>Managed By</DescriptionListTerm>
                        <DescriptionListDescription>
                          <a
                            href={resourceClaim?.metadata.annotations?.[`${BABYLON_DOMAIN}/externalPlatformUrl`]}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {resourceClaim?.metadata.annotations?.[`${BABYLON_DOMAIN}/externalPlatformUrl`]}
                          </a>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    ) : null}
                  </DescriptionList>
                </StackItem>
              ) : null}
              {resourceHandle.spec.resourcePool ? (
                <StackItem>
                  <Title headingLevel="h3">ResourcePool</Title>
                  <DescriptionList isHorizontal>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Name</DescriptionListTerm>
                      <DescriptionListDescription>
                        <Link key="admin" to={`/admin/resourcepools/${resourceHandle.spec.resourcePool.name}`}>
                          {resourceHandle.spec.resourcePool.name}
                        </Link>
                        <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourcePool} />
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  </DescriptionList>
                </StackItem>
              ) : null}
              {resourceHandle.spec.resources.map((resourceHandleSpecResource, idx) => {
                const resourceName = resourceHandleSpecResource.name || resourceHandleSpecResource.provider.name;
                return (
                  <StackItem key={idx}>
                    <Title headingLevel="h3">
                      {resourceName === 'babylon'
                        ? 'Babylon Legacy CloudForms Integration'
                        : `Resource ${resourceName}`}
                    </Title>
                    <DescriptionList isHorizontal>
                      {resourceHandleSpecResource.reference ? (
                        <DescriptionListGroup>
                          <DescriptionListTerm>{resourceHandleSpecResource.reference.kind}</DescriptionListTerm>
                          <DescriptionListDescription>
                            {resourceHandleSpecResource.reference?.kind === 'AnarchySubject' ? (
                              <>
                                <Link
                                  key="admin"
                                  to={`/admin/anarchysubjects/${resourceHandleSpecResource.reference.namespace}/${resourceHandleSpecResource.reference.name}`}
                                >
                                  AnarchySubject {resourceHandleSpecResource.reference.name} in{' '}
                                  {resourceHandleSpecResource.reference.namespace}
                                </Link>
                                <OpenshiftConsoleLink key="console" reference={resourceHandleSpecResource.reference} />
                              </>
                            ) : resourceHandleSpecResource.reference ? (
                              <>
                                {resourceHandleSpecResource.reference.kind} {resourceHandleSpecResource.reference.name}{' '}
                                in {resourceHandleSpecResource.reference.namespace}
                                <OpenshiftConsoleLink reference={resourceHandleSpecResource.reference} />
                              </>
                            ) : (
                              '-'
                            )}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      ) : null}
                      <DescriptionListGroup>
                        <DescriptionListTerm>ResourceProvider</DescriptionListTerm>
                        <DescriptionListDescription>
                          <Link to={`/admin/resourceproviders/${resourceHandleSpecResource.provider.name}`}>
                            {resourceHandleSpecResource.provider.name}
                          </Link>
                          <OpenshiftConsoleLink reference={resourceHandleSpecResource.provider} />
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    </DescriptionList>
                  </StackItem>
                );
              })}
            </Stack>
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <Editor
              height="500px"
              language="yaml"
              options={{ readOnly: true }}
              theme="vs-dark"
              value={yaml.dump(resourceHandle)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

export default ResourceHandleInstance;
