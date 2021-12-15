import React from "react";
import { useEffect, useState } from "react";
import { Link, useHistory } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
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
import Editor from "@monaco-editor/react";
const yaml = require('js-yaml');
import {
  ResourceHandle,
} from '@app/types';
import {
  deleteResourceHandle,
  getResourceClaim,
  getResourceHandle
} from '@app/api';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';
import CreateResourcePoolFromResourceHandleModal from './CreateResourcePoolFromResourceHandleModal';

import './admin.css';

export interface ResourceHandleInstanceProps {
  location?: any;
}

const ResourceHandleInstance: React.FunctionComponent<ResourceHandleInstanceProps> = ({
  location,
}) => {
  const consoleURL = useSelector(selectConsoleURL);
  const history = useHistory();
  const locationMatch = location.pathname.match(/^(.*\/resourcehandles)\/([^\/]+)(?:\/([^\/]+))?$/);
  const basePath = locationMatch[1];
  const resourceHandleName = locationMatch[2];
  const activeTab = locationMatch[3] || 'details';

  const [resourceHandle, setResourceHandle] = useState(undefined);
  const [resourceClaim, setResourceClaim] = useState(null);
  const [createResourcePoolFromResourceHandleModalIsOpen, setCreateResourcePoolFromResourceHandleModalIsOpen] = useState(false);

  async function confirmThenDelete() {
    if (confirm(`Delete ResourceHandle ${resourceHandleName}?`)) {
      await deleteResourceHandle(resourceHandle);
      history.push(basePath);
    }
  }

  async function fetchResourceHandle() {
    try {
      const handle = await getResourceHandle(resourceHandleName);
      setResourceHandle(handle);
      if (handle.spec.resourceClaim) {
        const claim = await getResourceClaim(handle.spec.resourceClaim.namespace, handle.spec.resourceClaim.name);
        setResourceClaim(claim);
      }
    } catch (err) {
      setResourceHandle(null);
    }
  }

  useEffect(() => {
    fetchResourceHandle()
  }, [resourceHandleName]);

  if (resourceHandle === undefined) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  } else if (resourceHandle === null) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            ResourceHandle not found
          </Title>
          <EmptyStateBody>
            ResourceHandle {resourceHandleName} was not found.
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (<>
    <CreateResourcePoolFromResourceHandleModal
      isOpen={createResourcePoolFromResourceHandleModalIsOpen}
      onClose={() => setCreateResourcePoolFromResourceHandleModalIsOpen(false)}
      resourceClaim={resourceClaim}
      resourceHandle={resourceHandle}
    />
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Breadcrumb>
        <BreadcrumbItem
          render={({ className }) => <Link to={basePath} className={className}>ResourceHandles</Link>}
        />
        <BreadcrumbItem>{ resourceHandle.metadata.name }</BreadcrumbItem>
      </Breadcrumb>
      <Split>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">ResourceHandle {resourceHandle.metadata.name}</Title>
        </SplitItem>
        <SplitItem>
          <ActionDropdown
            position="right"
            actionDropdownItems={[
              <ActionDropdownItem
                key="delete"
                label="Delete"
                onSelect={() => confirmThenDelete()}
              />,
              <ActionDropdownItem
                key="editInOpenShift"
                label="Edit in OpenShift Console"
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${resourceHandle.metadata.namespace}/${resourceHandle.apiVersion.replace('/', '~')}~${resourceHandle.kind}/${resourceHandle.metadata.name}/yaml`)}
              />,
              <ActionDropdownItem
                key="createResourcePool"
                isDisabled={
                  resourceHandle.spec.resourcePool ? true :
                  resourceHandle.spec.resources.find((resource) => resource.provider.name === 'babylon-user-configmap') ? true :
                  false
                }
                label="Create ResourcePool from ResourceHandle"
                onSelect={() => setCreateResourcePoolFromResourceHandleModalIsOpen(true)}
              />,
              <ActionDropdownItem
                key="openInOpenShift"
                label="Open in OpenShift Console"
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${resourceHandle.metadata.namespace}/${resourceHandle.apiVersion.replace('/', '~')}~${resourceHandle.kind}/${resourceHandle.metadata.name}`)}
              />
            ]}
          />
        </SplitItem>
      </Split>
    </PageSection>
    <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
      <Tabs activeKey={activeTab} onSelect={(e, tabIndex) => history.push(`${basePath}/${resourceHandleName}/${tabIndex}`)}>
        <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
          <Stack hasGutter>
            <StackItem>
              <DescriptionList isHorizontal>
                <DescriptionListGroup>
                  <DescriptionListTerm>Name</DescriptionListTerm>
                  <DescriptionListDescription>
                    {resourceHandle.metadata.name}<OpenshiftConsoleLink resource={resourceHandle}/>
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Created At</DescriptionListTerm>
                  <DescriptionListDescription>
                    <LocalTimestamp timestamp={resourceHandle.metadata.creationTimestamp}/>
                    {' '}
                    (<TimeInterval toTimestamp={resourceHandle.metadata.creationTimestamp}/>)
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </StackItem>
            { resourceHandle.spec.resourceClaim ? (
              <StackItem>
                <Title headingLevel="h3">ResourceClaim</Title>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup key="name">
                    <DescriptionListTerm>Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Link to={`/services/${resourceHandle.spec.resourceClaim.namespace}/${resourceHandle.spec.resourceClaim.name}`}>{resourceHandle.spec.resourceClaim.name}</Link>
                      <OpenshiftConsoleLink reference={resourceHandle.spec.resourceClaim}/>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup key="serviceNamespace">
                    <DescriptionListTerm>Service Namespace</DescriptionListTerm>
                    <DescriptionListDescription>
                      { resourceHandle.spec.resourceClaim ? (<>
                        <Link key="service" to={`/services/${resourceHandle.spec.resourceClaim.namespace}`}>{resourceHandle.spec.resourceClaim.namespace}</Link>
                        <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourceClaim} linkToNamespace={true}/>
                      </>) : '-' }
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup key="resourceClaimCreated">
                    <DescriptionListTerm>Created At</DescriptionListTerm>
                    <DescriptionListDescription>
                      { resourceClaim ? (<>
                        <LocalTimestamp timestamp={resourceClaim.metadata.creationTimestamp}/>
                        {' '}
                        (<TimeInterval toTimestamp={resourceClaim.metadata.creationTimestamp}/>)
                      </>) : '-' }
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  { resourceClaim?.metadata.labels?.['babylon.gpte.redhat.com/catalogItemName'] ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>CatalogItem</DescriptionListTerm>
                      <DescriptionListDescription>
                        <Link to={`/catalog/item/${resourceClaim?.metadata.labels?.['babylon.gpte.redhat.com/catalogItemNamespace']}/${resourceClaim?.metadata.labels?.['babylon.gpte.redhat.com/catalogItemName']}`}>{resourceClaim?.metadata.annotations?.['babylon.gpte.redhat.com/catalogItemDisplayName']}</Link>
                        <OpenshiftConsoleLink reference={{
                          apiVersion: "babylon.gpte.redhat.com/v1",
                          kind: "CatalogItem",
                          name: resourceClaim?.metadata.labels?.['babylon.gpte.redhat.com/catalogItemName'],
                          namespace: resourceClaim?.metadata.labels?.['babylon.gpte.redhat.com/catalogItemNamespace'],
                        }}/>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null }
                  { resourceClaim?.metadata.annotations?.['babylon.gpte.redhat.com/externalPlatformUrl'] ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Managed By</DescriptionListTerm>
                      <DescriptionListDescription>
                        <a href={resourceClaim?.metadata.annotations?.['babylon.gpte.redhat.com/externalPlatformUrl']} target="_blank">{resourceClaim?.metadata.annotations?.['babylon.gpte.redhat.com/externalPlatformUrl']}</a>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null }
                </DescriptionList>
              </StackItem>
            ) : null }
            { resourceHandle.spec.resourcePool ? (
              <StackItem>
                <Title headingLevel="h3">ResourcePool</Title>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Link key="admin" to={`/admin/resourcepools/${resourceHandle.spec.resourcePool.name}`}>{resourceHandle.spec.resourcePool.name}</Link>
                      <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourcePool}/>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </StackItem>
            ) : null }
            { resourceHandle.spec.resources.map((resourceHandleSpecResource, idx) => {
              const resourceName = resourceHandleSpecResource.name || resourceHandleSpecResource.provider.name;
              return (<StackItem key={idx}>
                <Title headingLevel="h3">{resourceName === 'babylon' ? 'Babylon Legacy CloudForms Integration' : `Resource ${resourceName}`}</Title>
                <DescriptionList isHorizontal>
                  { resourceHandleSpecResource.reference ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>{resourceHandleSpecResource.reference.kind}</DescriptionListTerm>
                      <DescriptionListDescription>
                        { resourceHandleSpecResource.reference?.kind === 'AnarchySubject' ? (
                          <>
                            <Link key="admin" to={`/admin/anarchysubjects/${resourceHandleSpecResource.reference.namespace}/${resourceHandleSpecResource.reference.name}`}>
                              AnarchySubject {resourceHandleSpecResource.reference.name} in {resourceHandleSpecResource.reference.namespace}
                            </Link>
                            <OpenshiftConsoleLink key="console" reference={resourceHandleSpecResource.reference}/>
                          </>
                        ) : resourceHandleSpecResource.reference ? (
                          <>
                            {resourceHandleSpecResource.reference.kind} {resourceHandleSpecResource.reference.name} in {resourceHandleSpecResource.reference.namespace}
                            <OpenshiftConsoleLink reference={resourceHandleSpecResource.reference}/>
                          </>
                        ) : '-' }
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null }
                  <DescriptionListGroup>
                    <DescriptionListTerm>ResourceProvider</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Link to={`/admin/resourceproviders/${resourceHandleSpecResource.provider.name}`}>{resourceHandleSpecResource.provider.name}</Link>
                      <OpenshiftConsoleLink reference={resourceHandleSpecResource.provider}/>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </StackItem>);
            }) }
          </Stack>
        </Tab>
        <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
          <Editor
            height="500px"
            language="yaml"
            options={{readOnly: true}}
            theme="vs-dark"
            value={yaml.dump(resourceHandle)}
          />
        </Tab>
      </Tabs>
    </PageSection>
  </>);
}

export default ResourceHandleInstance;
