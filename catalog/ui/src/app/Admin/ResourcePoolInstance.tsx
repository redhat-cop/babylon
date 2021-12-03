import React from "react";
import { useEffect, useState } from "react";
import { Link, useHistory } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
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
  NumberInput,
  PageSection,
  PageSectionVariants,
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
import Editor from "@monaco-editor/react";
const yaml = require('js-yaml');
import {
  ResourceHandle,
  deleteResourceHandle,
  deleteResourcePool,
  getResourcePool,
  listResourceHandles,
  patchResourcePool,
} from '@app/api';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { SelectableTable } from '@app/components/SelectableTable';
import { TimeInterval } from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';
import { OpenshiftConsoleLink } from './OpenshiftConsoleLink';

import './admin.css';

export interface ResourcePoolInstanceProps {
  location?: any;
}

const ResourcePoolInstance: React.FunctionComponent<ResourcePoolInstanceProps> = ({
  location,
}) => {
  const consoleURL = useSelector(selectConsoleURL);
  const history = useHistory();
  const locationMatch = location.pathname.match(/^(.*\/resourcepools)\/([^\/]+)(?:\/([^\/]+))?$/);
  const basePath = locationMatch[1];
  const resourcePoolName = locationMatch[2];
  const activeTab = locationMatch[3] || 'details';

  const [resourcePool, setResourcePool] = useState(undefined);
  const [resourceHandles, setResourceHandles] = useState([]);
  const [minAvailable, setMinAvailable] = useState(null);
  const [minAvailableInputTimeout, setMinAvailableInputTimeout] = useState(null);
  const [minAvailableUpdating, setMinAvailableUpdating] = useState(false);
  const [selectedResourceHandleUids, setSelectedResourceHandleUids] = React.useState([] as any);

  async function confirmThenDelete() {
    if (confirm(`Delete ResourcePool ${resourcePoolName}?`)) {
      await deleteResourcePool(resourcePool);
      history.push(basePath);
    }
  }

  async function confirmThenDeleteSelectedHandles() {
    if (confirm("Delete selected ResourceHandles?")) {
      for (const resourceHandle of resourceHandles) {
        if (selectedResourceHandleUids.includes(resourceHandle.metadata.uid)) {
          await deleteResourceHandle(resourceHandle);
        }
      }
      await fetchResourceHandles();
    }
  }

  async function fetchResourceHandles() {
    const resourceHandleList = await listResourceHandles({
      labelSelector: `poolboy.gpte.redhat.com/resource-pool-name=${resourcePoolName}`
    });
    setSelectedResourceHandleUids([]);
    setResourceHandles(resourceHandleList.items || []);
  }

  async function fetchResourcePool() {
    try {
      const result = await getResourcePool(resourcePoolName);
      setMinAvailable(result.spec.minAvailable);
      setResourcePool(result);
    } catch (err) {
      setResourcePool(null);
    }
  }

  function queueMinAvailableUpdate(n:number) {
    setMinAvailable(n);
    if (minAvailableInputTimeout) {
      clearTimeout(minAvailableInputTimeout);
    }
    setMinAvailableInputTimeout(
      setTimeout((n:number) => {
        updateMinAvailable(n);
      }, 1000, n)
    );
  }

  async function updateMinAvailable(n:number) {
    setMinAvailableUpdating(true);
    const result = await patchResourcePool(resourcePoolName, {spec: {minAvailable: n}});
    setMinAvailable(n);
    setResourcePool(result);
    setMinAvailableUpdating(false);
  }

  useEffect(() => {
    fetchResourcePool()
  }, [resourcePoolName]);

  useEffect(() => {
    if (resourcePool) {
      fetchResourceHandles();
    } else {
      setResourceHandles([]);
    }
  }, [resourcePool?.metadata?.uid]);

  if (resourcePool === undefined) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  } else if (resourcePool === null) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            ResourcePool not found
          </Title>
          <EmptyStateBody>
            ResourcePool {resourcePoolName} was not found.
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Breadcrumb>
        <BreadcrumbItem
          render={({ className }) => <Link to={basePath} className={className}>ResourcePools</Link>}
        />
        <BreadcrumbItem>{ resourcePool.metadata.name }</BreadcrumbItem>
      </Breadcrumb>
      <Split>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">ResourcePool {resourcePool.metadata.name}</Title>
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
                key="deletedSelectedHandles"
                isDisabled={selectedResourceHandleUids.length === 0}
                label="Delete Selected ResourceHandles"
                onSelect={() => confirmThenDeleteSelectedHandles()}
              />,
              <ActionDropdownItem
                key="editInOpenShift"
                label="Edit in OpenShift Console"
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${resourcePool.metadata.namespace}/${resourcePool.apiVersion.replace('/', '~')}~${resourcePool.kind}/${resourcePool.metadata.name}/yaml`)}
              />,
              <ActionDropdownItem
                key="openInOpenShift"
                label="Open in OpenShift Console"
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${resourcePool.metadata.namespace}/${resourcePool.apiVersion.replace('/', '~')}~${resourcePool.kind}/${resourcePool.metadata.name}`)}
              />
            ]}
          />
        </SplitItem>
      </Split>
    </PageSection>
    <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
      <Tabs activeKey={activeTab} onSelect={(e, tabIndex) => history.push(`${basePath}/${resourcePoolName}/${tabIndex}`)}>
        <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
          <Stack hasGutter>
            <StackItem>
              <DescriptionList isHorizontal>
                <DescriptionListGroup>
                  <DescriptionListTerm>Name</DescriptionListTerm>
                  <DescriptionListDescription>
                    {resourcePool.metadata.name}<OpenshiftConsoleLink resource={resourcePool}/>
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Created At</DescriptionListTerm>
                  <DescriptionListDescription>
                    <LocalTimestamp timestamp={resourcePool.metadata.creationTimestamp}/>
                    {' '}
                    (<TimeInterval to={resourcePool.metadata.creationTimestamp}/>)
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Minimum Available</DescriptionListTerm>
                  <DescriptionListDescription>
                    <NumberInput
                      min={0}
                      max={99}
                      onChange={(event:any) => queueMinAvailableUpdate(parseInt(event.target.value))}
                      onMinus={() => queueMinAvailableUpdate(minAvailable - 1)}
                      onPlus={() => queueMinAvailableUpdate(minAvailable + 1)}
                      value={minAvailable}
                    />
                    { minAvailableUpdating ? [' ', <Spinner key="spinner" isSVG size="md" />] : null }
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Default Lifespan</DescriptionListTerm>
                  <DescriptionListDescription>{resourcePool.spec.lifespan?.default || '-'}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Maximum Lifespan</DescriptionListTerm>
                  <DescriptionListDescription>{resourcePool.spec.lifespan?.maximum || '-'}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Relative Maximum Lifespan</DescriptionListTerm>
                  <DescriptionListDescription>{resourcePool.spec.lifespan?.relativeMaximum || '-'}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Unclaimed Handle Lifespan</DescriptionListTerm>
                  <DescriptionListDescription>{resourcePool.spec.lifespan?.unclaimed || '-'}</DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </StackItem>
          { resourcePool.spec.resources.map((resourcePoolSpecResource, idx) => {
            const resourceName = resourcePoolSpecResource.name || resourcePoolSpecResource.provider.name;
            return (<StackItem key={idx}>
              <Title headingLevel="h3">{resourceName === 'babylon' ? 'Babylon Legacy CloudForms Integration' : `Resource ${resourceName}`}</Title>
              <DescriptionList isHorizontal>
                <DescriptionListGroup>
                  <DescriptionListTerm>ResourceProvider</DescriptionListTerm>
                  <DescriptionListDescription>
                    <Link to={`/admin/resourceproviders/${resourcePoolSpecResource.provider.name}`}>{resourcePoolSpecResource.provider.name}</Link>
                    <OpenshiftConsoleLink reference={resourcePoolSpecResource.provider}/>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </StackItem>);
          }) }
          </Stack>
        </Tab>
        <Tab eventKey="handles" title={<TabTitleText>ResourceHandles</TabTitleText>}>
          <SelectableTable
            columns={['Name', 'Service Namespace', 'ResourceClaim', 'Created At']}
            onSelectAll={(isSelected) => {
              if (isSelected) {
                setSelectedResourceHandleUids(resourceHandles.map(resourceHandle => resourceHandle.metadata.uid));
              } else {
                setSelectedResourceHandleUids([]);
              }
            }}
            rows={resourceHandles.map((resourceHandle:ResourceHandle) => {
              return {
                cells: [
                  <>
                    <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.metadata.name}`}>{resourceHandle.metadata.name}</Link>
                    <OpenshiftConsoleLink key="console" resource={resourceHandle}/>
                  </>,
                  <>
                    { resourceHandle.spec.resourceClaim ? [
                      <Link key="admin" to={`/services/ns/${resourceHandle.spec.resourceClaim.namespace}`}>{resourceHandle.spec.resourceClaim.namespace}</Link>,
                      <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourceClaim} linkToNamespace={true}/>
                    ] : '-' }
                  </>,
                  <>
                    { resourceHandle.spec.resourceClaim ? [
                      <Link key="admin" to={`/services/ns/${resourceHandle.spec.resourceClaim.namespace}/item/${resourceHandle.spec.resourceClaim.name}`}>{resourceHandle.spec.resourceClaim.name}</Link>,
                      <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourceClaim}/>
                    ] : '-' }
                  </>,
                  <>
                    <LocalTimestamp key="timestamp" timestamp={resourceHandle.metadata.creationTimestamp}/>
                    {' '}
                    (<TimeInterval key="interval" to={resourceHandle.metadata.creationTimestamp}/>)
                  </>
                ],
                onSelect: (isSelected) => setSelectedResourceHandleUids(uids => {
                  if (isSelected) {
                    if (selectedResourceHandleUids.includes(resourceHandle.metadata.uid)) {
                      return selectedResourceHandleUids;
                    } else {
                      return [...selectedResourceHandleUids, resourceHandle.metadata.uid];
                    }
                  } else {
                    return uids.filter(uid => uid !== resourceHandle.metadata.uid);
                  }
                }),
                selected: selectedResourceHandleUids.includes(resourceHandle.metadata.uid),
              };
            })}
          />
        </Tab>
        <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
          <Editor
            height="500px"
            language="yaml"
            options={{readOnly: true}}
            theme="vs-dark"
            value={yaml.dump(resourcePool)}
          />
        </Tab>
      </Tabs>
    </PageSection>
  </>);
}

export default ResourcePoolInstance;
