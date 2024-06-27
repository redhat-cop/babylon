import React, { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
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
  EmptyStateHeader,
} from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import { apiPaths, deleteAnarchyGovernor, fetcher } from '@app/api';
import { AnarchyGovernor, AnarchySubjectList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import AnarchySubjectsTable from './AnarchySubjectsTable';
import useSession from '@app/utils/useSession';
import { useErrorHandler } from 'react-error-boundary';
import { compareK8sObjects, compareK8sObjectsArr } from '@app/util';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';

import './admin.css';

const AnarchyGovernorInstanceComponent: React.FC<{
  anarchyGovernorName: string;
  namespace: string;
  activeTab: string;
}> = ({ anarchyGovernorName, namespace, activeTab }) => {
  const navigate = useNavigate();
  const { consoleUrl } = useSession().getSession();
  const {
    data: anarchyGovernor,
    error,
    mutate,
  } = useSWR<AnarchyGovernor>(apiPaths.ANARCHY_GOVERNOR({ anarchyGovernorName, namespace }), fetcher, {
    refreshInterval: 8000,
    compare: compareK8sObjects,
  });
  useErrorHandler(error?.status === 404 ? error : null);

  const { data: anarchySubjectsList } = useSWR<AnarchySubjectList>(
    apiPaths.ANARCHY_SUBJECTS({ labelSelector: `anarchy.gpte.redhat.com/governor=${anarchyGovernorName}`, namespace }),
    fetcher,
    {
      refreshInterval: 8000,
      compare: (currentData, newData) => {
        if (currentData === newData) return true;
        if (!currentData || currentData.items.length === 0) return false;
        if (!newData || newData.items.length === 0) return false;
        if (currentData.items.length !== newData.items.length) return false;
        if (!compareK8sObjectsArr(currentData.items, newData.items)) return false;
        return true;
      },
    },
  );

  const anarchySubjects = useMemo(() => anarchySubjectsList.items, [anarchySubjectsList]);

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete AnarchyGovernor ${anarchyGovernorName}?`)) {
      await deleteAnarchyGovernor(anarchyGovernor);
      mutate();
      navigate(`/admin/anarchygovernors/${namespace}`);
    }
  }

  if (!anarchyGovernor) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateHeader
            titleText="AnarchyGovernor not found"
            icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />}
            headingLevel="h1"
          />
          <EmptyStateBody>
            AnarchyGovernor {anarchyGovernorName} was not found in namespace {namespace}.
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Breadcrumb>
          <BreadcrumbItem
            render={({ className }) => (
              <Link to="/admin/anarchygovernors" className={className}>
                AnarchyGovernors
              </Link>
            )}
          />
          <BreadcrumbItem
            render={({ className }) => (
              <Link to={`/admin/anarchygovernors/${namespace}`} className={className}>
                {namespace}
              </Link>
            )}
          />
          <BreadcrumbItem>{anarchyGovernor.metadata.name}</BreadcrumbItem>
        </Breadcrumb>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              AnarchyGovernor {anarchyGovernor.metadata.name}
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
                      `${consoleUrl}/k8s/ns/${anarchyGovernor.metadata.namespace}/${anarchyGovernor.apiVersion.replace(
                        '/',
                        '~',
                      )}~${anarchyGovernor.kind}/${anarchyGovernor.metadata.name}/yaml`,
                    )
                  }
                />,
                <ActionDropdownItem
                  key="openInOpenShift"
                  label="Open in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${anarchyGovernor.metadata.namespace}/${anarchyGovernor.apiVersion.replace(
                        '/',
                        '~',
                      )}~${anarchyGovernor.kind}/${anarchyGovernor.metadata.name}`,
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
          onSelect={(e, tabIndex) =>
            navigate(`/admin/anarchygovernors/${namespace}/${anarchyGovernorName}/${tabIndex}`)
          }
        >
          {/* @ts-ignore */}
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Name</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchyGovernor.metadata.name}
                  <OpenshiftConsoleLink resource={anarchyGovernor} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Created At</DescriptionListTerm>
                <DescriptionListDescription>
                  <LocalTimestamp timestamp={anarchyGovernor.metadata.creationTimestamp} />
                  <span style={{ padding: '0 6px' }}>
                    (<TimeInterval toTimestamp={anarchyGovernor.metadata.creationTimestamp} />)
                  </span>
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </Tab>
          {/* @ts-ignore */}
          <Tab eventKey="anarchysubjects" title={<TabTitleText>AnarchySubjects</TabTitleText>}>
            <AnarchySubjectsTable anarchySubjects={anarchySubjects} />
          </Tab>
          {/* @ts-ignore */}
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <Editor
              height="500px"
              language="yaml"
              options={{ readOnly: true }}
              theme="vs-dark"
              value={yaml.dump(anarchyGovernor)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const AnarchyGovernorInstance: React.FC = () => {
  const { name: anarchyGovernorName, namespace, tab: activeTab = 'details' } = useParams();
  return (
    <ErrorBoundaryPage namespace={namespace} name={anarchyGovernorName} type="AnarchyGovernor">
      <AnarchyGovernorInstanceComponent
        activeTab={activeTab}
        anarchyGovernorName={anarchyGovernorName}
        namespace={namespace}
      />
    </ErrorBoundaryPage>
  );
};

export default AnarchyGovernorInstance;
