import React from 'react';
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
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import { apiPaths, deleteAnarchyRun, fetcher } from '@app/api';
import { AnarchyRun } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import AnsibleRunLog from '@app/components/AnsibleRunLog';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import useSession from '@app/utils/useSession';
import { useErrorHandler } from 'react-error-boundary';
import { compareK8sObjects, FETCH_BATCH_LIMIT } from '@app/util';
import useMatchMutate from '@app/utils/useMatchMutate';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';

import './admin.css';

const AnarchyRunInstanceComponent: React.FC<{ anarchyRunName: string; namespace: string; activeTab: string }> = ({
  anarchyRunName,
  namespace,
  activeTab,
}) => {
  const navigate = useNavigate();
  const { consoleUrl } = useSession().getSession();
  const matchMutate = useMatchMutate();
  const {
    data: anarchyRun,
    error,
    mutate,
  } = useSWR<AnarchyRun>(
    apiPaths.ANARCHY_RUN({
      anarchyRunName,
      namespace,
    }),
    fetcher,
    {
      refreshInterval: 8000,
      compare: compareK8sObjects,
    }
  );
  useErrorHandler(error?.status === 404 ? error : null);

  async function confirmThenDelete() {
    if (confirm(`Delete AnarchyRun ${anarchyRunName}?`)) {
      await deleteAnarchyRun(anarchyRun);
      mutate(undefined);
      matchMutate([{ name: 'ANARCHY_RUNS', arguments: { limit: FETCH_BATCH_LIMIT, namespace }, data: undefined }]);
      navigate(`/admin/anarchyruns/${namespace}`);
    }
  }

  return (
    <>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Breadcrumb>
          <BreadcrumbItem
            render={({ className }) => (
              <Link to="/admin/anarchyruns" className={className}>
                AnarchyRuns
              </Link>
            )}
          />
          <BreadcrumbItem
            render={({ className }) => (
              <Link to={`/admin/anarchyruns/${namespace}`} className={className}>
                {namespace}
              </Link>
            )}
          />
          <BreadcrumbItem>{anarchyRun.metadata.name}</BreadcrumbItem>
        </Breadcrumb>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              AnarchyRun {anarchyRun.metadata.name}
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
                      `${consoleUrl}/k8s/ns/${anarchyRun.metadata.namespace}/${anarchyRun.apiVersion.replace(
                        '/',
                        '~'
                      )}~${anarchyRun.kind}/${anarchyRun.metadata.name}/yaml`
                    )
                  }
                />,
                <ActionDropdownItem
                  key="openInOpenShift"
                  label="Open in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${anarchyRun.metadata.namespace}/${anarchyRun.apiVersion.replace(
                        '/',
                        '~'
                      )}~${anarchyRun.kind}/${anarchyRun.metadata.name}`
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
          onSelect={(e, tabIndex) => navigate(`/admin/anarchyruns/${namespace}/${anarchyRunName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Name</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchyRun.metadata.name}
                  <OpenshiftConsoleLink resource={anarchyRun} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Namespace</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchyRun.metadata.namespace}
                  <OpenshiftConsoleLink resource={anarchyRun} linkToNamespace={true} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Created At</DescriptionListTerm>
                <DescriptionListDescription>
                  <LocalTimestamp timestamp={anarchyRun.metadata.creationTimestamp} />
                  <span style={{ padding: '0 6px' }}>
                    (<TimeInterval toTimestamp={anarchyRun.metadata.creationTimestamp} />)
                  </span>
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>AnarchyGovernor</DescriptionListTerm>
                <DescriptionListDescription>
                  <Link
                    to={`/admin/anarchygovernors/${anarchyRun.spec.governor.namespace}/${anarchyRun.spec.governor.name}`}
                  >
                    {anarchyRun.spec.governor.name}
                  </Link>
                  <OpenshiftConsoleLink reference={anarchyRun.spec.governor} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>AnarchySubject</DescriptionListTerm>
                <DescriptionListDescription>
                  <Link
                    to={`/admin/anarchysubjects/${anarchyRun.spec.subject.namespace}/${anarchyRun.spec.subject.name}`}
                  >
                    {anarchyRun.spec.subject.name}
                  </Link>
                  <OpenshiftConsoleLink reference={anarchyRun.spec.subject} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              {anarchyRun.spec.action ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>AnarchyAction</DescriptionListTerm>
                  <DescriptionListDescription>
                    <Link
                      to={`/admin/anarchyactions/${anarchyRun.spec.action.namespace}/${anarchyRun.spec.action.name}`}
                    >
                      {anarchyRun.spec.action.name}
                    </Link>
                    <OpenshiftConsoleLink reference={anarchyRun.spec.action} />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
              <DescriptionListGroup>
                <DescriptionListTerm>AnarchyRunner Pod</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchyRun.spec?.runnerPod ? (
                    <>
                      {anarchyRun.spec.runnerPod.name}
                      <OpenshiftConsoleLink reference={anarchyRun.spec.runnerPod} />
                    </>
                  ) : (
                    <p>-</p>
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Ansible Galaxy Requirements</DescriptionListTerm>
                <DescriptionListDescription>
                  <pre>{yaml.dump(anarchyRun.spec.ansibleGalaxyRequirements)}</pre>
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </Tab>
          <Tab eventKey="log" title={<TabTitleText>Ansible Log</TabTitleText>}>
            {anarchyRun.spec?.result?.ansibleRun || anarchyRun.status?.result?.ansibleRun ? (
              <AnsibleRunLog
                ansibleRun={anarchyRun.spec?.result?.ansibleRun || anarchyRun.status?.result?.ansibleRun}
              />
            ) : (
              <EmptyState variant="full">
                <EmptyStateIcon icon={ExclamationTriangleIcon} />
                <Title headingLevel="h1" size="lg">
                  AnarchyRun log not available.
                </Title>
              </EmptyState>
            )}
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <Editor
              height="500px"
              language="yaml"
              options={{ readOnly: true }}
              theme="vs-dark"
              value={yaml.dump(anarchyRun)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const AnarchyRunInstance: React.FC = () => {
  const { name: anarchyRunName, namespace, tab = 'details' } = useParams();
  return (
    <ErrorBoundaryPage namespace={namespace} name={anarchyRunName} type="AnarchyRun">
      <AnarchyRunInstanceComponent namespace={namespace} anarchyRunName={anarchyRunName} activeTab={tab} />
    </ErrorBoundaryPage>
  );
};

export default AnarchyRunInstance;
