import React, { useEffect, useReducer, useRef } from 'react';
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
  Tabs,
  Tab,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import {
  deleteAnarchyAction,
  deleteAnarchyRun,
  deleteAnarchySubject,
  forceDeleteAnarchySubject,
  getAnarchySubject,
  listAnarchyActions,
  listAnarchyRuns,
} from '@app/api';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchyAction, AnarchyActionList, AnarchyRun, AnarchyRunList, AnarchySubject } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';
import AnarchyActionsTable from './AnarchyActionsTable';
import AnarchyRunsTable from './AnarchyRunsTable';
import Footer from '@app/components/Footer';

import './admin.css';

const AnarchySubjectInstance: React.FC = () => {
  const navigate = useNavigate();
  const consoleURL = useSelector(selectConsoleURL);
  const componentWillUnmount = useRef(false);
  const { name: anarchySubjectName, namespace: anarchySubjectNamespace, tab: activeTab = 'details' } = useParams();

  const [anarchyActionsFetchState, reduceAnarchyActionsFetchState] = useReducer(k8sFetchStateReducer, null);
  const [anarchyRunsFetchState, reduceAnarchyRunsFetchState] = useReducer(k8sFetchStateReducer, null);
  const [anarchySubjectFetchState, reduceAnarchySubjectFetchState] = useReducer(k8sFetchStateReducer, null);
  const [selectedAnarchyActionUids, reduceAnarchyActionSelectedUids] = useReducer(selectedUidsReducer, []);
  const [selectedAnarchyRunUids, reduceAnarchyRunSelectedUids] = useReducer(selectedUidsReducer, []);

  const anarchyActions: AnarchyAction[] = (anarchyActionsFetchState?.items as AnarchyAction[]) || [];
  const anarchyRuns: AnarchyRun[] = (anarchyRunsFetchState?.items as AnarchyRun[]) || [];
  const anarchySubject: AnarchySubject | null = (anarchySubjectFetchState?.item as AnarchySubject) || null;

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete AnarchySubject ${anarchySubjectName}?`)) {
      await deleteAnarchySubject(anarchySubject);
      navigate(`/admin/anarchysubjects/${anarchySubjectNamespace}`);
    }
  }

  async function confirmThenForceDelete(): Promise<void> {
    if (
      confirm(
        `Force delete AnarchySubject ${anarchySubjectName}? Forcing delete may orphan provisioned cloud resources!`
      )
    ) {
      await forceDeleteAnarchySubject(anarchySubject);
      navigate(`/admin/anarchysubjects/${anarchySubjectNamespace}`);
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
      reduceAnarchyActionsFetchState({ type: 'removeItems', items: removedAnarchyActions });
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
      reduceAnarchyRunsFetchState({ type: 'removeItems', items: removedAnarchyRuns });
    }
  }

  async function fetchAnarchyActions(): Promise<void> {
    const anarchyActionList: AnarchyActionList = await listAnarchyActions({
      labelSelector: `anarchy.gpte.redhat.com/subject=${anarchySubjectName}`,
      namespace: anarchySubjectNamespace,
    });
    if (!anarchyActionsFetchState.activity.canceled) {
      reduceAnarchyActionsFetchState({
        type: 'post',
        k8sObjectList: anarchyActionList,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceAnarchyActionsFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  async function fetchAnarchyRuns(): Promise<void> {
    const anarchyRunList: AnarchyRunList = await listAnarchyRuns({
      labelSelector: `anarchy.gpte.redhat.com/subject=${anarchySubjectName}`,
      namespace: anarchySubjectNamespace,
    });
    if (!anarchyRunsFetchState.activity.canceled) {
      reduceAnarchyRunsFetchState({
        type: 'post',
        k8sObjectList: anarchyRunList,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceAnarchyRunsFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  async function fetchAnarchySubject(): Promise<void> {
    let anarchySubject: AnarchySubject = null;
    try {
      anarchySubject = await getAnarchySubject(anarchySubjectNamespace, anarchySubjectName);
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 404) {
        throw error;
      }
    }
    if (!anarchySubjectFetchState.activity.canceled) {
      reduceAnarchySubjectFetchState({
        type: 'post',
        item: anarchySubject,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceAnarchySubjectFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  // First render and detect unmount
  useEffect(() => {
    reduceAnarchyActionsFetchState({ type: 'startFetch' });
    reduceAnarchyRunsFetchState({ type: 'startFetch' });
    reduceAnarchySubjectFetchState({ type: 'startFetch' });
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  useEffect(() => {
    if (anarchyActionsFetchState?.canContinue) {
      fetchAnarchyActions();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(anarchyActionsFetchState);
      }
    };
  }, [anarchyActionsFetchState]);

  useEffect(() => {
    if (anarchyRunsFetchState?.canContinue) {
      fetchAnarchyRuns();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(anarchyRunsFetchState);
      }
    };
  }, [anarchyRunsFetchState]);

  useEffect(() => {
    if (anarchySubjectFetchState?.canContinue) {
      fetchAnarchySubject();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(anarchySubjectFetchState);
      }
    };
  }, [anarchySubjectFetchState]);

  if (!anarchySubject) {
    if (anarchySubjectFetchState?.finished) {
      return (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              AnarchySubject not found
            </Title>
            <EmptyStateBody>
              AnarchySubject {anarchySubjectName} was not found in namespace {anarchySubjectNamespace}.
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
              <Link to={`/admin/anarchysubjects/${anarchySubjectNamespace}`} className={className}>
                {anarchySubjectNamespace}
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
                      `${consoleURL}/k8s/ns/${anarchySubject.metadata.namespace}/${anarchySubject.apiVersion.replace(
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
                      `${consoleURL}/k8s/ns/${anarchySubject.metadata.namespace}/${anarchySubject.apiVersion.replace(
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
          onSelect={(e, tabIndex) =>
            navigate(`/admin/anarchysubjects/${anarchySubjectNamespace}/${anarchySubjectName}/${tabIndex}`)
          }
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
                  TowerJobs
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
              fetchState={anarchyActionsFetchState}
              selectedUids={selectedAnarchyActionUids}
              selectedUidsReducer={reduceAnarchyActionSelectedUids}
            />
          </Tab>
          <Tab eventKey="anarchyruns" title={<TabTitleText>AnarchyRuns</TabTitleText>}>
            <AnarchyRunsTable
              anarchyRuns={anarchyRuns}
              fetchState={anarchyRunsFetchState}
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
      <Footer />
    </>
  );
};

export default AnarchySubjectInstance;
