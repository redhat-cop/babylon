import React from "react";
import { useEffect, useReducer, useState } from "react";
import { Link, useHistory, useRouteMatch } from 'react-router-dom';
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
  deleteResourceProvider,
  getResourceProvider,
} from '@app/api';

import {
  cancelFetchState,
  fetchStateReducer,
} from '@app/reducers';

import {
  ResourceProvider,
  FetchState,
} from '@app/types';

import { selectConsoleURL } from '@app/store';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
  
import './admin.css';

interface RouteMatchParams {
  name: string;
  tab?: string;
}

const ResourceProviderInstance: React.FunctionComponent = () => {
  const history = useHistory();
  const consoleURL = useSelector(selectConsoleURL);
  const routeMatch = useRouteMatch<RouteMatchParams>('/admin/resourceproviders/:name/:tab?');
  const resourceProviderName = routeMatch.params.name;
  const activeTab = routeMatch.params.tab || 'details';

  const [resourceProvider, setResourceProvider] = useState<ResourceProvider>(null);
  const [resourceProviderFetchState, reduceResourceProviderFetchState] = useReducer(fetchStateReducer, {});

  async function confirmThenDelete() {
    if (confirm(`Delete ResourceProvider ${resourceProviderName}?`)) {
      await deleteResourceProvider(resourceProvider);
      history.push('/admin/resourceproviders');
    }
  }

  async function fetchResourceProvider(): Promise<void> {
    try {
      const resourceProvider:ResourceProvider = await getResourceProvider(resourceProviderName);
      if (resourceProviderFetchState.canceled) {
        return;
      } else {
        setResourceProvider(resourceProvider);
      }
    } catch(error) {
      if (error instanceof Response && error.status === 404) {
        setResourceProvider(null);
      } else {
        throw error;
      }
    }
    reduceResourceProviderFetchState({
      refreshTimeout: setTimeout(() => reduceResourceProviderFetchState({type: 'refresh'}), 3000),
      type: 'finish'
    });
  }

  useEffect(() => {
    if (!resourceProviderFetchState.finished) {
      fetchResourceProvider();
    }
    return () => cancelFetchState(resourceProviderFetchState);
  }, [resourceProviderFetchState])

  if (!resourceProvider) {
    if (resourceProviderFetchState.finished || resourceProviderFetchState.isRefresh) {
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

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Breadcrumb>
        <BreadcrumbItem
          render={({ className }) => <Link to="/admin/resourceproviders" className={className}>ResourceProviders</Link>}
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
      <Tabs activeKey={activeTab} onSelect={(e, tabIndex) => history.push(`/admin/resourceproviders/${resourceProviderName}/${tabIndex}`)}>
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
                (<TimeInterval toTimestamp={resourceProvider.metadata.creationTimestamp}/>)
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
