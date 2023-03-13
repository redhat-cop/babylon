import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Tabs,
  Tab,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import { apiPaths, deleteResourceProvider, fetcher } from '@app/api';
import { ResourceProvider, ResourceProviderList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import useSWR from 'swr';
import { useErrorHandler } from 'react-error-boundary';
import { compareK8sObjects, FETCH_BATCH_LIMIT } from '@app/util';
import useMatchMutate from '@app/utils/useMatchMutate';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import useSession from '@app/utils/useSession';

import './admin.css';

const ResourceProviderInstanceComponent: React.FC<{ resourceProviderName: string; activeTab: string }> = ({
  resourceProviderName,
  activeTab,
}) => {
  const navigate = useNavigate();
  const { consoleUrl } = useSession().getSession();
  const matchMutate = useMatchMutate();

  const {
    data: resourceProvider,
    error,
    mutate,
  } = useSWR<ResourceProvider>(apiPaths.RESOURCE_PROVIDER({ resourceProviderName }), fetcher, {
    refreshInterval: 8000,
    compare: compareK8sObjects,
  });
  useErrorHandler(error?.status === 404 ? error : null);

  function mutateResourceProvidersList(data: ResourceProviderList) {
    matchMutate([{ name: 'RESOURCE_PROVIDERS', arguments: { limit: FETCH_BATCH_LIMIT }, data }]);
  }

  async function confirmThenDelete() {
    if (confirm(`Delete ResourceProvider ${resourceProviderName}?`)) {
      await deleteResourceProvider(resourceProvider);
      mutate(undefined);
      mutateResourceProvidersList(undefined);
      navigate('/admin/resourceproviders');
    }
  }

  return (
    <>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Breadcrumb>
          <BreadcrumbItem
            render={({ className }) => (
              <Link to="/admin/resourceproviders" className={className}>
                ResourceProviders
              </Link>
            )}
          />
          <BreadcrumbItem>{resourceProvider.metadata.name}</BreadcrumbItem>
        </Breadcrumb>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              ResourceProvider {resourceProvider.metadata.name}
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
                      `${consoleUrl}/k8s/ns/${
                        resourceProvider.metadata.namespace
                      }/${resourceProvider.apiVersion.replace('/', '~')}~${resourceProvider.kind}/${
                        resourceProvider.metadata.name
                      }/yaml`
                    )
                  }
                />,
                <ActionDropdownItem
                  key="openInOpenShift"
                  label="Open in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${
                        resourceProvider.metadata.namespace
                      }/${resourceProvider.apiVersion.replace('/', '~')}~${resourceProvider.kind}/${
                        resourceProvider.metadata.name
                      }`
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
          onSelect={(e, tabIndex) => navigate(`/admin/resourceproviders/${resourceProviderName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Name</DescriptionListTerm>
                <DescriptionListDescription>
                  {resourceProvider.metadata.name}
                  <OpenshiftConsoleLink resource={resourceProvider} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Created At</DescriptionListTerm>
                <DescriptionListDescription>
                  <LocalTimestamp timestamp={resourceProvider.metadata.creationTimestamp} />
                  <span style={{ padding: '0 6px' }}>
                    (<TimeInterval toTimestamp={resourceProvider.metadata.creationTimestamp} />)
                  </span>
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Default Lifespan</DescriptionListTerm>
                <DescriptionListDescription>
                  {resourceProvider.spec.lifespan?.default || <p>-</p>}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Maximum Lifespan</DescriptionListTerm>
                <DescriptionListDescription>
                  {resourceProvider.spec.lifespan?.maximum || <p>-</p>}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Relative Maximum Lifespan</DescriptionListTerm>
                <DescriptionListDescription>
                  {resourceProvider.spec.lifespan?.relativeMaximum || <p>-</p>}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <Editor
              height="500px"
              language="yaml"
              options={{ readOnly: true }}
              theme="vs-dark"
              value={yaml.dump(resourceProvider)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const ResourceProviderInstance: React.FC = () => {
  const { name: resourceProviderName, tab: activeTab = 'details' } = useParams();
  return (
    <ErrorBoundaryPage name={resourceProviderName} type="ResourceProvider">
      <ResourceProviderInstanceComponent activeTab={activeTab} resourceProviderName={resourceProviderName} />
    </ErrorBoundaryPage>
  );
};

export default ResourceProviderInstance;
