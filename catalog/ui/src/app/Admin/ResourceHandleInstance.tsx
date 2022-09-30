import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { apiPaths, deleteResourceHandle, fetcher } from '@app/api';
import { BABYLON_DOMAIN } from '@app/util';
import { selectConsoleURL } from '@app/store';
import { ResourceClaim, ResourceHandle } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import CreateResourcePoolFromResourceHandleModal from './CreateResourcePoolFromResourceHandleModal';
import Modal, { useModal } from '@app/Modal/Modal';
import useSWR from 'swr';
import { ErrorBoundary, useErrorHandler } from 'react-error-boundary';

import './admin.css';

const ResourceHandleInstanceComponent: React.FC<{ resourceHandleName: string; activeTab?: string }> = ({
  resourceHandleName,
  activeTab,
}) => {
  const navigate = useNavigate();
  const consoleURL = useSelector(selectConsoleURL);
  const [createResourcePoolFromResourceHandleModal, openCreateResourcePoolFromResourceHandleModal] = useModal();

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete ResourceHandle ${resourceHandleName}?`)) {
      await deleteResourceHandle(resourceHandle);
      navigate('/admin/resourcehandles');
    }
  }

  const { data: resourceHandle, error } = useSWR<ResourceHandle>(
    apiPaths.RESOURCE_HANDLE({
      resourceHandleName,
    }),
    fetcher,
    {
      refreshInterval: 8000,
    }
  );
  useErrorHandler(error?.status === 404 ? error : null);

  const { data: resourceClaim } = useSWR<ResourceClaim>(
    resourceHandle.spec.resourceClaim
      ? apiPaths.RESOURCE_CLAIM({
          namespace: resourceHandle.spec.resourceClaim.namespace,
          resourceClaimName: resourceHandle.spec.resourceClaim.name,
        })
      : null,
    fetcher,
    {
      refreshInterval: 8000,
    }
  );

  return (
    <>
      <Modal
        ref={createResourcePoolFromResourceHandleModal}
        title="Create ResourcePool from ResourceHandle"
        passModifiers={true}
        onConfirm={null}
      >
        <CreateResourcePoolFromResourceHandleModal resourceClaim={resourceClaim} resourceHandle={resourceHandle} />
      </Modal>
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
                  onSelect={openCreateResourcePoolFromResourceHandleModal}
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
          onSelect={(e, tabIndex) => navigate(`/admin/resourcehandles/${resourceHandleName}/${tabIndex}`)}
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
                      <LocalTimestamp timestamp={resourceHandle.metadata.creationTimestamp} />
                      <span style={{ padding: '0 6px' }}>
                        (<TimeInterval toTimestamp={resourceHandle.metadata.creationTimestamp} />)
                      </span>
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
                          <p>-</p>
                        )}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup key="resourceClaimCreated">
                      <DescriptionListTerm>Created At</DescriptionListTerm>
                      <DescriptionListDescription>
                        {resourceClaim ? (
                          <>
                            <LocalTimestamp timestamp={resourceClaim.metadata.creationTimestamp} />
                            <span style={{ padding: '0 6px' }}>
                              (<TimeInterval toTimestamp={resourceClaim.metadata.creationTimestamp} />)
                            </span>
                          </>
                        ) : (
                          <p>-</p>
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
                              <p>-</p>
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

const NotFoundComponent: React.FC<{
  resourceHandleName: string;
}> = ({ resourceHandleName }) => (
  <EmptyState variant="full">
    <EmptyStateIcon icon={ExclamationTriangleIcon} />
    <Title headingLevel="h1" size="lg">
      ResourceHandle not found
    </Title>
    <EmptyStateBody>ResourceHandle {resourceHandleName} was not found.</EmptyStateBody>
  </EmptyState>
);
const ResourceHandleInstance: React.FC = () => {
  const { name: resourceHandleName, tab: activeTab = 'details' } = useParams();
  return (
    <ErrorBoundary fallbackRender={() => <NotFoundComponent resourceHandleName={resourceHandleName} />}>
      <ResourceHandleInstanceComponent activeTab={activeTab} resourceHandleName={resourceHandleName} />
    </ErrorBoundary>
  );
};

export default ResourceHandleInstance;
