import React, { useMemo, useReducer } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
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
import { apiPaths, deleteAnarchyAction, fetcher } from '@app/api';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchyAction, AnarchyRunList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import AnarchyRunsTable from './AnarchyRunsTable';
import useSession from '@app/utils/useSession';
import { useErrorHandler } from 'react-error-boundary';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import { compareK8sObjects, compareK8sObjectsArr } from '@app/util';
import useMatchMutate from '@app/utils/useMatchMutate';

import './admin.css';

const AnarchyActionInstanceComponent: React.FC<{ anarchyActionName: string; namespace: string; activeTab: string }> = ({
  anarchyActionName,
  namespace,
  activeTab,
}) => {
  const navigate = useNavigate();
  const matchMutate = useMatchMutate();
  const { consoleUrl } = useSession().getSession();
  const [selectedAnarchyRunUids, reduceAnarchyRunSelectedUids] = useReducer(selectedUidsReducer, []);

  const {
    data: anarchyAction,
    error,
    mutate,
  } = useSWR<AnarchyAction>(apiPaths.ANARCHY_ACTION({ anarchyActionName, namespace }), fetcher, {
    refreshInterval: 8000,
    compare: compareK8sObjects,
  });
  useErrorHandler(error?.status === 404 ? error : null);

  const { data: anarchyRunsList } = useSWR<AnarchyRunList>(
    apiPaths.ANARCHY_RUNS({ labelSelector: `anarchy.gpte.redhat.com/action=${anarchyActionName}`, namespace }),
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
    }
  );

  const anarchyRuns = useMemo(() => anarchyRunsList.items, [anarchyRunsList]);

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete AnarchyAction ${anarchyActionName}?`)) {
      await deleteAnarchyAction(anarchyAction);
      mutate(undefined);
      matchMutate([{ name: 'ANARCHY_ACTIONS', arguments: { namespace }, data: undefined }]);
      navigate(`/admin/anarchyactions/${namespace}`);
    }
  }

  return (
    <>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Breadcrumb>
          <BreadcrumbItem
            render={({ className }) => (
              <Link to="/admin/anarchyactions" className={className}>
                AnarchyActions
              </Link>
            )}
          />
          <BreadcrumbItem
            render={({ className }) => (
              <Link to={`/admin/anarchyactions/${namespace}`} className={className}>
                {namespace}
              </Link>
            )}
          />
          <BreadcrumbItem>{anarchyAction.metadata.name}</BreadcrumbItem>
        </Breadcrumb>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              AnarchyAction {anarchyAction.metadata.name}
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
                      `${consoleUrl}/k8s/ns/${anarchyAction.metadata.namespace}/${anarchyAction.apiVersion.replace(
                        '/',
                        '~'
                      )}~${anarchyAction.kind}/${anarchyAction.metadata.name}/yaml`
                    )
                  }
                />,
                <ActionDropdownItem
                  key="openInOpenShift"
                  label="Open in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${anarchyAction.metadata.namespace}/${anarchyAction.apiVersion.replace(
                        '/',
                        '~'
                      )}~${anarchyAction.kind}/${anarchyAction.metadata.name}`
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
          onSelect={(e, tabIndex) => navigate(`/admin/anarchyactions/${namespace}/${anarchyActionName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Name</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchyAction.metadata.name}
                  <OpenshiftConsoleLink resource={anarchyAction} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Created At</DescriptionListTerm>
                <DescriptionListDescription>
                  <LocalTimestamp timestamp={anarchyAction.metadata.creationTimestamp} />
                  <span style={{ padding: '0 6px' }}>
                    (<TimeInterval toTimestamp={anarchyAction.metadata.creationTimestamp} />)
                  </span>
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Action</DescriptionListTerm>
                <DescriptionListDescription>{anarchyAction.spec.action}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>AnarchyGovernor</DescriptionListTerm>
                <DescriptionListDescription>
                  <Link
                    to={`/admin/anarchygovernors/${anarchyAction.spec.governorRef.namespace}/${anarchyAction.spec.governorRef.name}`}
                  >
                    {anarchyAction.spec.governorRef.name}
                  </Link>
                  <OpenshiftConsoleLink reference={anarchyAction.spec.governorRef} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>AnarchySubject</DescriptionListTerm>
                <DescriptionListDescription>
                  <Link
                    to={`/admin/anarchysubjects/${anarchyAction.spec.subjectRef.namespace}/${anarchyAction.spec.subjectRef.name}`}
                  >
                    {anarchyAction.spec.subjectRef.name}
                  </Link>
                  <OpenshiftConsoleLink reference={anarchyAction.spec.subjectRef} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>AnarchyRun</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchyAction.status?.runRef ? (
                    <>
                      <Link
                        key="admin"
                        to={`/admin/anarchyruns/${anarchyAction.status.runRef.namespace}/${anarchyAction.status.runRef.name}`}
                      >
                        {anarchyAction.status.runRef.name}
                      </Link>
                      <OpenshiftConsoleLink key="console" reference={anarchyAction.status.runRef} />
                    </>
                  ) : (
                    <p>-</p>
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </Tab>
          <Tab eventKey="anarchyruns" title={<TabTitleText>AnarchyRuns</TabTitleText>}>
            <AnarchyRunsTable
              anarchyRuns={anarchyRuns}
              selectedUids={selectedAnarchyRunUids}
              selectedUidsReducer={reduceAnarchyRunSelectedUids}
            />
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <Editor
              height="500px"
              language="yaml"
              options={{ readOnly: true }}
              theme="vs-dark"
              value={yaml.dump(anarchyAction)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const AnarchyActionInstance: React.FC = () => {
  const { name: anarchyActionName, namespace, tab: activeTab = 'details' } = useParams();
  return (
    <ErrorBoundaryPage namespace={namespace} name={anarchyActionName} type="AnarchyAction">
      <AnarchyActionInstanceComponent
        activeTab={activeTab}
        anarchyActionName={anarchyActionName}
        namespace={namespace}
      />
    </ErrorBoundaryPage>
  );
};

export default AnarchyActionInstance;
