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
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Tabs,
  Tab,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import Editor from "@monaco-editor/react";
const yaml = require('js-yaml');
import {
  ResourceProvider,
  deleteResourceProvider,
  getResourceProvider,
} from '@app/api';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { TimeInterval } from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';
import OpenshiftConsoleLink from './OpenshiftConsoleLink';
  
import './admin.css';

export interface ResourceProviderInstanceProps {
  location?: any;
}

const ResourceProviderInstance: React.FunctionComponent<ResourceProviderInstanceProps> = ({
  location,
}) => {
  const consoleURL = useSelector(selectConsoleURL);
  const history = useHistory();
  const locationMatch = location.pathname.match(/^(.*\/resourceproviders)\/([^\/]+)(?:\/([^\/]+))?$/);
  const basePath = locationMatch[1];
  const resourceProviderName = locationMatch[2];
  const activeTab = locationMatch[3] || 'details';

  const [resourceProvider, setResourceProvider] = useState(undefined);

  async function confirmThenDelete() {
    if (confirm(`Delete ResourceProvider ${resourceProviderName}?`)) {
      await deleteResourceProvider(resourceProvider);
      history.push(basePath);
    }
  }

  async function fetchResourceProvider() {
    try {
      const result:ResourceProvider = await getResourceProvider(resourceProviderName);
      setResourceProvider(result);
    } catch (err) {
      setResourceProvider(null);
    }
  }

  useEffect(() => {
    fetchResourceProvider()
  }, [resourceProviderName]);

  if (resourceProvider === undefined) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  } else if (resourceProvider === null) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            ResourceProvider not found
          </Title>
          <EmptyStateBody>
            ResourceProvider {resourceProviderName} was not found.
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Breadcrumb>
        <BreadcrumbItem
          render={({ className }) => <Link to={basePath} className={className}>ResourceProviders</Link>}
        />
        <BreadcrumbItem>{ resourceProvider.metadata.name }</BreadcrumbItem>
      </Breadcrumb>
      <Split>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">ResourceProvider {resourceProvider.metadata.name}</Title>
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
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${resourceProvider.metadata.namespace}/${resourceProvider.apiVersion.replace('/', '~')}~${resourceProvider.kind}/${resourceProvider.metadata.name}/yaml`)}
              />,
              <ActionDropdownItem
                key="openInOpenShift"
                label="Open in OpenShift Console"
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${resourceProvider.metadata.namespace}/${resourceProvider.apiVersion.replace('/', '~')}~${resourceProvider.kind}/${resourceProvider.metadata.name}`)}
              />
            ]}
          />
        </SplitItem>
      </Split>
    </PageSection>
    <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
      <Tabs activeKey={activeTab} onSelect={(e, tabIndex) => history.push(`${basePath}/${resourceProviderName}/${tabIndex}`)}>
        <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>Name</DescriptionListTerm>
              <DescriptionListDescription>
                {resourceProvider.metadata.name}<OpenshiftConsoleLink resource={resourceProvider}/>
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Created At</DescriptionListTerm>
              <DescriptionListDescription>
                <LocalTimestamp timestamp={resourceProvider.metadata.creationTimestamp}/>
                {' '}
                (<TimeInterval to={resourceProvider.metadata.creationTimestamp}/>)
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Default Lifespan</DescriptionListTerm>
              <DescriptionListDescription>{resourceProvider.spec.lifespan?.default || '-'}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Maximum Lifespan</DescriptionListTerm>
              <DescriptionListDescription>{resourceProvider.spec.lifespan?.maximum || '-'}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Relative Maximum Lifespan</DescriptionListTerm>
              <DescriptionListDescription>{resourceProvider.spec.lifespan?.relativeMaximum || '-'}</DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        </Tab>
        <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
          <Editor
            height="500px"
            language="yaml"
            options={{readOnly: true}}
            theme="vs-dark"
            value={yaml.dump(resourceProvider)}
          />
        </Tab>
      </Tabs>
    </PageSection>
  </>);
}

export default ResourceProviderInstance;
