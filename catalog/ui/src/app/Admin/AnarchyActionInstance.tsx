import React, { useEffect, useReducer, useRef } from 'react';
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
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';

import { deleteAnarchyAction, deleteAnarchyRun, getAnarchyAction, listAnarchyRuns } from '@app/api';

import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchyAction, AnarchyRun, AnarchyRunList } from '@app/types';

import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';

import AnarchyRunsTable from './AnarchyRunsTable';

import './admin.css';

const AnarchyActionInstance: React.FC = () => {
  const history = useHistory();
  const consoleURL = useSelector(selectConsoleURL);
  const componentWillUnmount = useRef(false);
  const routeMatch = useRouteMatch<{
    name: string;
    namespace: string;
    tab?: string;
  }>('/admin/anarchyactions/:namespace/:name/:tab?');
  const anarchyActionName = routeMatch.params.name;
  const anarchyActionNamespace = routeMatch.params.namespace;
  const activeTab = routeMatch.params.tab || 'details';

  const [anarchyActionFetchState, reduceAnarchyActionFetchState] = useReducer(k8sFetchStateReducer, null);
  const [anarchyRunsFetchState, reduceAnarchyRunsFetchState] = useReducer(k8sFetchStateReducer, null);
  const [selectedAnarchyRunUids, reduceAnarchyRunSelectedUids] = useReducer(selectedUidsReducer, []);

  const anarchyAction: AnarchyAction | null = (anarchyActionFetchState?.item as AnarchyRun) || null;
  const anarchyRuns: AnarchyRun[] = (anarchyRunsFetchState?.items as AnarchyRun[]) || [];

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete AnarchyAction ${anarchyActionName}?`)) {
      await deleteAnarchyAction(anarchyAction);
      history.push(`/admin/anarchyactions/${anarchyActionNamespace}`);
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

  async function fetchAnarchyAction(): Promise<void> {
    let anarchyAction: AnarchyAction = null;
    try {
      anarchyAction = await getAnarchyAction(anarchyActionNamespace, anarchyActionName);
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 404) {
        throw error;
      }
    }
    if (!anarchyActionFetchState.activity.canceled) {
      reduceAnarchyActionFetchState({
        type: 'post',
        item: anarchyAction,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceAnarchyActionFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  async function fetchAnarchyRuns(): Promise<void> {
    const anarchyRunList: AnarchyRunList = await listAnarchyRuns({
      labelSelector: `anarchy.gpte.redhat.com/action=${anarchyActionName}`,
      namespace: anarchyActionNamespace,
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

  // First render and detect unmount
  useEffect(() => {
    reduceAnarchyActionFetchState({ type: 'startFetch' });
    reduceAnarchyRunsFetchState({ type: 'startFetch' });
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  useEffect(() => {
    if (anarchyActionFetchState?.canContinue) {
      fetchAnarchyAction();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(anarchyActionFetchState);
      }
    };
  }, [anarchyActionFetchState]);

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

  if (!anarchyAction) {
    if (anarchyActionFetchState?.finished) {
      return (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              AnarchyAction not found
            </Title>
            <EmptyStateBody>
              AnarchyAction {anarchyActionName} was not found in namespace {anarchyActionNamespace}.
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
              <Link to="/admin/anarchyactions" className={className}>
                AnarchyActions
              </Link>
            )}
          />
          <BreadcrumbItem
            render={({ className }) => (
              <Link to={`/admin/anarchyactions/${anarchyActionNamespace}`} className={className}>
                {anarchyActionNamespace}
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
                      `${consoleURL}/k8s/ns/${anarchyAction.metadata.namespace}/${anarchyAction.apiVersion.replace(
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
                      `${consoleURL}/k8s/ns/${anarchyAction.metadata.namespace}/${anarchyAction.apiVersion.replace(
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
          onSelect={(e, tabIndex) =>
            history.push(`/admin/anarchyactions/${anarchyActionNamespace}/${anarchyActionName}/${tabIndex}`)
          }
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
                  <LocalTimestamp timestamp={anarchyAction.metadata.creationTimestamp} /> (
                  <TimeInterval toTimestamp={anarchyAction.metadata.creationTimestamp} />)
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
                    '-'
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
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
              value={yaml.dump(anarchyAction)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

export default AnarchyActionInstance;
