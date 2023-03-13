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
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import {
  apiPaths,
  deleteAnarchyAction,
  deleteAnarchyRun,
  deleteAnarchySubject,
  fetcher,
  forceDeleteAnarchySubject,
} from '@app/api';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchyAction, AnarchyActionList, AnarchyRun, AnarchyRunList, AnarchySubject } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import AnarchyActionsTable from './AnarchyActionsTable';
import AnarchyRunsTable from './AnarchyRunsTable';
import { useErrorHandler } from 'react-error-boundary';
import useSession from '@app/utils/useSession';
import { compareK8sObjects, compareK8sObjectsArr } from '@app/util';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';

import './admin.css';

const AnarchySubjectInstanceComponent: React.FC<{
  anarchySubjectName: string;
  namespace: string;
  activeTab: string;
}> = ({ anarchySubjectName, namespace, activeTab }) => {
  const navigate = useNavigate();
  const { consoleUrl } = useSession().getSession();
  const [selectedAnarchyActionUids, reduceAnarchyActionSelectedUids] = useReducer(selectedUidsReducer, []);
  const [selectedAnarchyRunUids, reduceAnarchyRunSelectedUids] = useReducer(selectedUidsReducer, []);

  const {
    data: anarchySubject,
    error,
    mutate,
  } = useSWR<AnarchySubject>(
    apiPaths.ANARCHY_SUBJECT({
      anarchySubjectName,
      namespace,
    }),
    fetcher,
    {
      refreshInterval: 8000,
      compare: compareK8sObjects,
    }
  );
  useErrorHandler(error?.status === 404 ? error : null);

  const { data: anarchyActionsList, mutate: mutateAnarchyActions } = useSWR<AnarchyActionList>(
    apiPaths.ANARCHY_ACTIONS({ labelSelector: `anarchy.gpte.redhat.com/subject=${anarchySubjectName}`, namespace }),
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
  const anarchyActions = useMemo(() => anarchyActionsList.items, [anarchyActionsList]);

  const { data: anarchyRunsList, mutate: mutateAnarchyRuns } = useSWR<AnarchyRunList>(
    apiPaths.ANARCHY_RUNS({ labelSelector: `anarchy.gpte.redhat.com/subject=${anarchySubjectName}`, namespace }),
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
    if (confirm(`Delete AnarchySubject ${anarchySubjectName}?`)) {
      await deleteAnarchySubject(anarchySubject);
      navigate(`/admin/anarchysubjects/${namespace}`);
      mutate(null);
    }
  }

  async function confirmThenForceDelete(): Promise<void> {
    if (
      confirm(
        `Force delete AnarchySubject ${anarchySubjectName}? Forcing delete may orphan provisioned cloud resources!`
      )
    ) {
      await forceDeleteAnarchySubject(anarchySubject);
      navigate(`/admin/anarchysubjects/${namespace}`);
    }
  }

  async function confirmThenDeleteAnarchyActions(): Promise<void> {
    if (confirm(`Delete selected AnarchyActions?`)) {
      const removedAnarchyActions: AnarchyAction[] = [];
      for (const anarchyAction of anarchyActions) {
        if (selectedAnarchyActionUids.includes(anarchyAction.metadata.uid)) {
          await deleteAnarchyAction(anarchyAction);
          removedAnarchyActions.push(anarchyAction);
        }
      }
      reduceAnarchyActionSelectedUids({ type: 'clear' });
      mutateAnarchyActions({
        ...anarchyActionsList,
        items: anarchyActionsList.items.filter(
          (i) => !removedAnarchyActions.some((r) => r.metadata.uid === i.metadata.uid)
        ),
      });
    }
  }

  async function confirmThenDeleteAnarchyRuns(): Promise<void> {
    if (confirm(`Delete selected AnarchyRuns?`)) {
      const removedAnarchyRuns: AnarchyRun[] = [];
      for (const anarchyRun of anarchyRuns) {
        if (selectedAnarchyRunUids.includes(anarchyRun.metadata.uid)) {
          await deleteAnarchyRun(anarchyRun);
          removedAnarchyRuns.push(anarchyRun);
        }
      }
      reduceAnarchyRunSelectedUids({ type: 'clear' });
      mutateAnarchyRuns({
        ...anarchyRunsList,
        items: anarchyRunsList.items.filter((i) => !removedAnarchyRuns.some((r) => r.metadata.uid === i.metadata.uid)),
      });
    }
  }

  if (!anarchySubject) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            AnarchySubject not found
          </Title>
          <EmptyStateBody>
            AnarchySubject {anarchySubjectName} was not found in namespace {namespace}.
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
              <Link to="/admin/anarchysubjects" className={className}>
                AnarchySubjects
              </Link>
            )}
          />
          <BreadcrumbItem
            render={({ className }) => (
              <Link to={`/admin/anarchysubjects/${namespace}`} className={className}>
                {namespace}
              </Link>
            )}
          />
          <BreadcrumbItem>{anarchySubject.metadata.name}</BreadcrumbItem>
        </Breadcrumb>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              AnarchySubject {anarchySubject.metadata.name}
            </Title>
          </SplitItem>
          <SplitItem>
            <ActionDropdown
              position="right"
              actionDropdownItems={[
                <ActionDropdownItem key="delete" label="Delete" onSelect={() => confirmThenDelete()} />,
                <ActionDropdownItem
                  key="force-delete"
                  label="Force Delete"
                  onSelect={() => confirmThenForceDelete()}
                />,
                <ActionDropdownItem
                  key="deleteAnarchyActions"
                  label="Delete selected AnarchyActions"
                  isDisabled={selectedAnarchyActionUids.length < 1}
                  onSelect={() => confirmThenDeleteAnarchyActions()}
                />,
                <ActionDropdownItem
                  key="deleteAnarchyRuns"
                  label="Delete selected AnarchyRuns"
                  isDisabled={selectedAnarchyRunUids.length < 1}
                  onSelect={() => confirmThenDeleteAnarchyRuns()}
                />,
                <ActionDropdownItem
                  key="editInOpenShift"
                  label="Edit in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${anarchySubject.metadata.namespace}/${anarchySubject.apiVersion.replace(
                        '/',
                        '~'
                      )}~${anarchySubject.kind}/${anarchySubject.metadata.name}/yaml`
                    )
                  }
                />,
                <ActionDropdownItem
                  key="openInOpenShift"
                  label="Open in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${anarchySubject.metadata.namespace}/${anarchySubject.apiVersion.replace(
                        '/',
                        '~'
                      )}~${anarchySubject.kind}/${anarchySubject.metadata.name}`
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
          onSelect={(e, tabIndex) => navigate(`/admin/anarchysubjects/${namespace}/${anarchySubjectName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Name</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchySubject.metadata.name}
                  <OpenshiftConsoleLink resource={anarchySubject} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Current State</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchySubject.spec.vars?.current_state || <p>-</p>}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Desired State</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchySubject.spec.vars?.desired_state || <p>-</p>}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Created At</DescriptionListTerm>
                <DescriptionListDescription>
                  <LocalTimestamp timestamp={anarchySubject.metadata.creationTimestamp} />
                  <span style={{ padding: '0 6px' }}>
                    (<TimeInterval toTimestamp={anarchySubject.metadata.creationTimestamp} />)
                  </span>
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>ResourceHandle</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchySubject.metadata.annotations?.['poolboy.gpte.redhat.com/resource-handle-name'] ? (
                    <>
                      <Link
                        key="admin"
                        to={`/admin/resourcehandles/${anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name']}`}
                      >
                        {anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name']}
                      </Link>
                      <OpenshiftConsoleLink
                        reference={{
                          apiVersion: 'poolboy.gpte.redhat.com/v1',
                          kind: 'ResourceHandle',
                          name: anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name'],
                          namespace:
                            anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-namespace'],
                        }}
                      />
                    </>
                  ) : (
                    <p>-</p>
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>ResourceClaim</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchySubject.metadata.annotations?.['poolboy.gpte.redhat.com/resource-claim-name'] ? (
                    <>
                      <Link
                        key="admin"
                        to={`/services/${anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace']}/${anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name']}`}
                      >
                        {anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name']}
                      </Link>
                      <OpenshiftConsoleLink
                        reference={{
                          apiVersion: 'poolboy.gpte.redhat.com/v1',
                          kind: 'ResourceClaim',
                          name: anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name'],
                          namespace:
                            anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace'],
                        }}
                      />
                    </>
                  ) : (
                    <p>-</p>
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Service Namespace</DescriptionListTerm>
                <DescriptionListDescription>
                  {anarchySubject.metadata.annotations?.['poolboy.gpte.redhat.com/resource-claim-name'] ? (
                    <>
                      <Link
                        key="admin"
                        to={`/services/${anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace']}`}
                      >
                        {anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace']}
                      </Link>
                      <OpenshiftConsoleLink
                        linkToNamespace
                        reference={{
                          apiVersion: 'poolboy.gpte.redhat.com/v1',
                          kind: 'ResourceClaim',
                          name: anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name'],
                          namespace:
                            anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace'],
                        }}
                      />
                    </>
                  ) : (
                    <p>-</p>
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
            {anarchySubject.status?.towerJobs ? (
              <>
                <Title key="title" headingLevel="h5" size="lg">
                  AnsibleJobs
                </Title>
                <DescriptionList isHorizontal key="tower-jobs">
                  {Object.entries(anarchySubject.status.towerJobs)
                    .filter(([, jobDetails]) => jobDetails.towerJobURL)
                    .map(([jobName, jobDetails]) => {
                      const jobUrl = jobDetails.towerJobURL.startsWith('https://')
                        ? jobDetails.towerJobURL
                        : `https://${jobDetails.towerJobURL}`;
                      return (
                        <DescriptionListGroup key={jobName}>
                          <DescriptionListTerm>{jobName}</DescriptionListTerm>
                          <DescriptionListDescription>
                            <a href={jobUrl} target="_blank" rel="noreferrer">
                              {jobUrl}
                            </a>
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      );
                    })}
                </DescriptionList>
              </>
            ) : null}
          </Tab>
          <Tab eventKey="anarchyactions" title={<TabTitleText>AnarchyActions</TabTitleText>}>
            <AnarchyActionsTable
              anarchyActions={anarchyActions}
              selectedUids={selectedAnarchyActionUids}
              selectedUidsReducer={reduceAnarchyActionSelectedUids}
            />
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
              value={yaml.dump(anarchySubject)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const AnarchySubjectInstance: React.FC = () => {
  const { name: anarchySubjectName, namespace, tab = 'details' } = useParams();
  return (
    <ErrorBoundaryPage namespace={namespace} name={anarchySubjectName} type="AnarchySubject">
      <AnarchySubjectInstanceComponent namespace={namespace} anarchySubjectName={anarchySubjectName} activeTab={tab} />
    </ErrorBoundaryPage>
  );
};

export default AnarchySubjectInstance;
