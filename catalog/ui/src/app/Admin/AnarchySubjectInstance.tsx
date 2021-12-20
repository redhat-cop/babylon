import React from "react";
import { useEffect, useReducer, useState } from "react";
import { Link, useHistory, useRouteMatch } from 'react-router-dom';
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
import Editor from "@monaco-editor/react";
const yaml = require('js-yaml');

import {
  deleteAnarchyAction,
  deleteAnarchyRun,
  deleteAnarchySubject,
  getAnarchySubject,
  listAnarchyActions,
  listAnarchyRuns,
} from '@app/api';

import {
  cancelFetchState,
  fetchStateReducer,
  k8sObjectsReducer,
  selectedUidsReducer,
} from '@app/reducers';

import {
  AnarchyAction,
  AnarchyActionList,
  AnarchyRun,
  AnarchyRunList,
  AnarchySubject,
  FetchState,
} from '@app/types';

import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';

import AnarchyActionsTable from './AnarchyActionsTable';
import AnarchyRunsTable from './AnarchyRunsTable';

import './admin.css';

interface RouteMatchParams {
  name: string;
  namespace: string;
  tab?: string;
}

const AnarchySubjectInstance:React.FunctionComponent = () => {
  const history = useHistory();
  const consoleURL = useSelector(selectConsoleURL);
  const routeMatch = useRouteMatch<RouteMatchParams>('/admin/anarchysubjects/:namespace/:name/:tab?');
  const anarchySubjectName = routeMatch.params.name;
  const anarchySubjectNamespace = routeMatch.params.namespace;
  const activeTab = routeMatch.params.tab || 'details';

  const [_anarchyActions, reduceAnarchyActions] = useReducer(k8sObjectsReducer, []);
  const [anarchyActionsFetchState, reduceAnarchyActionsFetchState] = useReducer(fetchStateReducer, {});
  const [_anarchyRuns, reduceAnarchyRuns] = useReducer(k8sObjectsReducer, []);
  const [anarchyRunsFetchState, reduceAnarchyRunsFetchState] = useReducer(fetchStateReducer, {});
  const [anarchySubject, setAnarchySubject] = useState<AnarchySubject|null>(null);
  const [anarchySubjectFetchState, reduceAnarchySubjectFetchState] = useReducer(fetchStateReducer, {});
  const [selectedAnarchyActionUids, reduceAnarchyActionSelectedUids] = useReducer(selectedUidsReducer, []);
  const [selectedAnarchyRunUids, reduceAnarchyRunSelectedUids] = useReducer(selectedUidsReducer, []);

  const anarchyActions = _anarchyActions as AnarchyAction[];
  const anarchyRuns = _anarchyRuns as AnarchyRun[];

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete AnarchySubject ${anarchySubjectName}?`)) {
      await deleteAnarchySubject(anarchySubject);
      history.push(`/admin/anarchysubjects/${anarchySubjectNamespace}`);
    }
  }

  async function confirmThenDeleteAnarchyActions(): Promise<void> {
    if (confirm(`Delete selected AnarchyActions?`)) {
      const removedAnarchyActions:AnarchyAction[] = [];
      for (const anarchyAction of anarchyActions) {
        if (selectedAnarchyActionUids.includes(anarchyAction.metadata.uid)) {
          await deleteAnarchyAction(anarchyAction);
          removedAnarchyActions.push(anarchyAction);
        }
      }
      reduceAnarchyActionSelectedUids({type: 'clear'});
      reduceAnarchyActions({type: 'remove', items: removedAnarchyActions});
    }
  }

  async function confirmThenDeleteAnarchyRuns(): Promise<void> {
    if (confirm(`Delete selected AnarchyRuns?`)) {
      const removedAnarchyRuns:AnarchyRun[] = [];
      for (const anarchyRun of anarchyRuns) {
        if (selectedAnarchyRunUids.includes(anarchyRun.metadata.uid)) {
          await deleteAnarchyRun(anarchyRun);
          removedAnarchyRuns.push(anarchyRun);
        }
      }
      reduceAnarchyRunSelectedUids({type: 'clear'});
      reduceAnarchyRuns({type: 'remove', items: removedAnarchyRuns});
    }
  }

  async function fetchAnarchyActions(): Promise<void> {
    const anarchyActionList:AnarchyActionList = await listAnarchyActions({
      labelSelector: `anarchy.gpte.redhat.com/subject=${anarchySubjectName}`,
      namespace: anarchySubjectNamespace,
    });
    if (!anarchyActionsFetchState.canceled) {
      reduceAnarchyActions({type: 'set', items: anarchyActionList.items});
      reduceAnarchyActionsFetchState({
        refreshTimeout: setTimeout(() => reduceAnarchyActionsFetchState({type: 'refresh'}), 3000),
        type: 'finish'
      });
    }
  }

  async function fetchAnarchyRuns(): Promise<void> {
    const anarchyRunList:AnarchyRunList = await listAnarchyRuns({
      labelSelector: `anarchy.gpte.redhat.com/subject=${anarchySubjectName}`,
      namespace: anarchySubjectNamespace,
    });
    if (!anarchyRunsFetchState.canceled) {
      reduceAnarchyRuns({type: 'set', items: anarchyRunList.items});
      reduceAnarchyRunsFetchState({
        refreshTimeout: setTimeout(() => reduceAnarchyRunsFetchState({type: 'refresh'}), 3000),
        type: 'finish',
      });
    }
  }

  async function fetchAnarchySubject(): Promise<void> {
    try {
      const anarchySubject:AnarchySubject = await getAnarchySubject(anarchySubjectNamespace, anarchySubjectName);
      if (anarchySubjectFetchState.canceled) {
        return;
      } else {
        setAnarchySubject(anarchySubject);
      }
    } catch(error) {
      if (error instanceof Response && error.status === 404) {
        setAnarchySubject(null);
      } else {
        throw error;
      }
    }
    reduceAnarchySubjectFetchState({
      refreshTimeout: setTimeout(() => reduceAnarchySubjectFetchState({type: 'refresh'}), 3000),
      type: 'finish'
    });
  }

  useEffect(() => {
    if (!anarchyActionsFetchState.finished) {
      fetchAnarchyActions();
    }
    return () => cancelFetchState(anarchyActionsFetchState);
  }, [anarchyActionsFetchState]);

  useEffect(() => {
    if (!anarchyRunsFetchState.finished) {
      fetchAnarchyRuns();
    }
    return () => cancelFetchState(anarchyRunsFetchState);
  }, [anarchyRunsFetchState]);

  useEffect(() => {
    if (!anarchySubjectFetchState.finished) {
      fetchAnarchySubject();
    }
    return () => cancelFetchState(anarchySubjectFetchState);
  }, [anarchySubjectFetchState]);

  if (!anarchySubject) {
    if (anarchySubjectFetchState.finished || anarchySubjectFetchState.isRefresh) {
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

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Breadcrumb>
        <BreadcrumbItem
          render={({ className }) => <Link to="/admin/anarchysubjects" className={className}>AnarchySubjects</Link>}
        />
        <BreadcrumbItem
          render={({ className }) => <Link to={`/admin/anarchysubjects/${anarchySubjectNamespace}`} className={className}>{anarchySubjectNamespace}</Link>}
        />
        <BreadcrumbItem>{ anarchySubject.metadata.name }</BreadcrumbItem>
      </Breadcrumb>
      <Split>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">AnarchySubject {anarchySubject.metadata.name}</Title>
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
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${anarchySubject.metadata.namespace}/${anarchySubject.apiVersion.replace('/', '~')}~${anarchySubject.kind}/${anarchySubject.metadata.name}/yaml`)}
              />,
              <ActionDropdownItem
                key="openInOpenShift"
                label="Open in OpenShift Console"
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${anarchySubject.metadata.namespace}/${anarchySubject.apiVersion.replace('/', '~')}~${anarchySubject.kind}/${anarchySubject.metadata.name}`)}
              />
            ]}
          />
        </SplitItem>
      </Split>
    </PageSection>
    <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
      <Tabs activeKey={activeTab} onSelect={(e, tabIndex) => history.push(`/admin/anarchysubjects/${anarchySubjectNamespace}/${anarchySubjectName}/${tabIndex}`)}>
        <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>Name</DescriptionListTerm>
              <DescriptionListDescription>
                {anarchySubject.metadata.name}
                <OpenshiftConsoleLink resource={anarchySubject}/>
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Current State</DescriptionListTerm>
              <DescriptionListDescription>
                { anarchySubject.spec.vars?.current_state || '-' }
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Desired State</DescriptionListTerm>
              <DescriptionListDescription>
                { anarchySubject.spec.vars?.desired_state || '-' }
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Created At</DescriptionListTerm>
              <DescriptionListDescription>
                <LocalTimestamp timestamp={anarchySubject.metadata.creationTimestamp}/>
                {' '}
                (<TimeInterval toTimestamp={anarchySubject.metadata.creationTimestamp}/>)
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>ResourceHandle</DescriptionListTerm>
              <DescriptionListDescription>
                { anarchySubject.metadata.annotations?.['poolboy.gpte.redhat.com/resource-handle-name'] ? (
                  <>
                    <Link key="admin" to={`/admin/resourcehandles/${anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name']}`}>{anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name']}</Link>
                    <OpenshiftConsoleLink reference={{
                      apiVersion: 'poolboy.gpte.redhat.com/v1',
                      kind: 'ResourceHandle',
                      name: anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name'],
                      namespace: anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-namespace'],
                    }}/>
                  </>
                ) : '-' }
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>ResourceClaim</DescriptionListTerm>
              <DescriptionListDescription>
                { anarchySubject.metadata.annotations?.['poolboy.gpte.redhat.com/resource-claim-name'] ? (
                  <>
                    <Link key="admin" to={`/services/${anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace']}/${anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name']}`}>{anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name']}</Link>
                    <OpenshiftConsoleLink reference={{
                      apiVersion: 'poolboy.gpte.redhat.com/v1',
                      kind: 'ResourceClaim',
                      name: anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name'],
                      namespace: anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace'],
                    }}/>
                  </>
                ) : '-' }
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Service Namespace</DescriptionListTerm>
              <DescriptionListDescription>
                { anarchySubject.metadata.annotations?.['poolboy.gpte.redhat.com/resource-claim-name'] ? (
                  <>
                    <Link key="admin" to={`/services/${anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace']}`}>{anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace']}</Link>
                    <OpenshiftConsoleLink linkToNamespace reference={{
                      apiVersion: 'poolboy.gpte.redhat.com/v1',
                      kind: 'ResourceClaim',
                      name: anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name'],
                      namespace: anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace'],
                    }}/>
                  </>
                ) : '-' }
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
          { anarchySubject.status?.towerJobs ? (<>
            <Title key="title" headingLevel="h5" size="lg">TowerJobs</Title>
            <DescriptionList isHorizontal key="tower-jobs">
              { Object.entries(anarchySubject.status.towerJobs).map(([jobName, jobDetails]) => {
                const jobUrl = jobDetails.towerJobURL.startsWith('https://') ?
                  jobDetails.towerJobURL : `https://${jobDetails.towerJobURL}`;
                return (
                  <DescriptionListGroup>
                    <DescriptionListTerm>{jobName}</DescriptionListTerm>
                    <DescriptionListDescription>
                      <a href={jobUrl} target="_blank">{jobUrl}</a>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                );
              })}
            </DescriptionList>
          </>) : null }
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
            options={{readOnly: true}}
            theme="vs-dark"
            value={yaml.dump(anarchySubject)}
          />
        </Tab>
      </Tabs>
    </PageSection>
  </>);
}

export default AnarchySubjectInstance;
