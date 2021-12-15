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
  deleteAnarchyGovernor,
  deleteAnarchySubject,
  getAnarchyGovernor,
  listAnarchySubjects,
} from '@app/api';

import {
  cancelFetchState,
  fetchStateReducer,
  k8sObjectsReducer,
  selectedUidsReducer,
} from '@app/reducers';

import {
  AnarchyGovernor,
  AnarchySubject,
  AnarchySubjectList,
  FetchState,
} from '@app/types';

import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';

import AnarchySubjectsTable from './AnarchySubjectsTable';

import './admin.css';

interface RouteMatchParams {
  name: string;
  namespace: string;
  tab?: string;
}

const AnarchyGovernorInstance: React.FunctionComponent = () => {
  const history = useHistory();
  const consoleURL = useSelector(selectConsoleURL);
  const routeMatch = useRouteMatch<RouteMatchParams>('/admin/anarchygovernors/:namespace/:name/:tab?');
  const anarchyGovernorName = routeMatch.params.name;
  const anarchyGovernorNamespace = routeMatch.params.namespace;
  const activeTab = routeMatch.params.tab || 'details';

  const [anarchyGovernor, setAnarchyGovernor] = useState<AnarchyGovernor|null>(null);
  const [anarchyGovernorFetchState, reduceAnarchyGovernorFetchState] = useReducer(fetchStateReducer, {});
  const [anarchySubjects, reduceAnarchySubjects] = useReducer(k8sObjectsReducer, []);
  const [anarchySubjectsFetchState, reduceAnarchySubjectsFetchState] = useReducer(fetchStateReducer, {});
  const [selectedAnarchySubjectUids, reduceAnarchySubjectSelectedUids] = useReducer(selectedUidsReducer, []);

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete AnarchyGovernor ${anarchyGovernorName}?`)) {
      await deleteAnarchyGovernor(anarchyGovernor);
      history.push(`/admin/anarchygovernors/${anarchyGovernorNamespace}`);
    }
  }

  async function confirmThenDeleteAnarchySubjects(): Promise<void> {
    if (confirm(`Delete selected AnarchySubjects?`)) {
      const removedAnarchySubjects:AnarchySubject[] = [];
      for (const anarchySubject of anarchySubjects) {
        if (selectedAnarchySubjectUids.includes(anarchySubject.metadata.uid)) {
          await deleteAnarchySubject(anarchySubject);
          removedAnarchySubjects.push(anarchySubject);
        }
      }
      reduceAnarchySubjectSelectedUids({type: 'clear'});
      reduceAnarchySubjects({type: 'remove', items: removedAnarchySubjects});
    }
  }

  async function fetchAnarchyGovernor(): Promise<void> {
    try {
      const anarchyGovernor:AnarchyGovernor = await getAnarchyGovernor(anarchyGovernorNamespace, anarchyGovernorName);
      if (anarchyGovernorFetchState.canceled) {
        return;
      } else {
        setAnarchyGovernor(anarchyGovernor);
      }
    } catch(error) {
      if (error instanceof Response && error.status === 404) {
        setAnarchyGovernor(null);
      } else {
        throw error;
      }
    }
    reduceAnarchyGovernorFetchState({
      refreshTimeout: setTimeout(() => reduceAnarchyGovernorFetchState({type: 'refresh'}), 3000),
      type: 'finish'
    });
  }

  async function fetchAnarchySubjects(): Promise<void> {
    const anarchySubjectList:AnarchySubjectList = await listAnarchySubjects({
      labelSelector: `anarchy.gpte.redhat.com/governor=${anarchyGovernorName}`,
      namespace: anarchyGovernorNamespace,
    });
    if (!anarchySubjectsFetchState.canceled) {
      reduceAnarchySubjects({type: 'set', items: anarchySubjectList.items});
      reduceAnarchySubjectsFetchState({
        refreshTimeout: setTimeout(() => reduceAnarchySubjectsFetchState({type: 'refresh'}), 3000),
        type: 'finish',
      });
    }
  }

  useEffect(() => {
    if (!anarchyGovernorFetchState.finished) {
      fetchAnarchyGovernor();
    }
    return () => cancelFetchState(anarchyGovernorFetchState);
  }, [anarchyGovernorFetchState]);

  useEffect(() => {
    if (!anarchySubjectsFetchState.finished) {
      fetchAnarchySubjects();
    }
    return () => cancelFetchState(anarchySubjectsFetchState);
  }, [anarchySubjectsFetchState]);

  if (!anarchyGovernor) {
    if (anarchyGovernorFetchState.finished || anarchyGovernorFetchState.isRefresh) {
      return (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              AnarchyGovernor not found
            </Title>
            <EmptyStateBody>
              AnarchyGovernor {anarchyGovernorName} was not found in namespace {anarchyGovernorNamespace}.
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
          render={({ className }) => <Link to="/admin/anarchygovernors" className={className}>AnarchyGovernors</Link>}
        />
        <BreadcrumbItem
          render={({ className }) => <Link to={`/admin/anarchygovernors/${anarchyGovernorNamespace}`} className={className}>{anarchyGovernorNamespace}</Link>}
        />
        <BreadcrumbItem>{ anarchyGovernor.metadata.name }</BreadcrumbItem>
      </Breadcrumb>
      <Split>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">AnarchyGovernor {anarchyGovernor.metadata.name}</Title>
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
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${anarchyGovernor.metadata.namespace}/${anarchyGovernor.apiVersion.replace('/', '~')}~${anarchyGovernor.kind}/${anarchyGovernor.metadata.name}/yaml`)}
              />,
              <ActionDropdownItem
                key="openInOpenShift"
                label="Open in OpenShift Console"
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${anarchyGovernor.metadata.namespace}/${anarchyGovernor.apiVersion.replace('/', '~')}~${anarchyGovernor.kind}/${anarchyGovernor.metadata.name}`)}
              />
            ]}
          />
        </SplitItem>
      </Split>
    </PageSection>
    <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
      <Tabs activeKey={activeTab} onSelect={(e, tabIndex) => history.push(`/admin/anarchygovernors/${anarchyGovernorNamespace}/${anarchyGovernorName}/${tabIndex}`)}>
        <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>Name</DescriptionListTerm>
              <DescriptionListDescription>
                {anarchyGovernor.metadata.name}
                <OpenshiftConsoleLink resource={anarchyGovernor}/>
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Created At</DescriptionListTerm>
              <DescriptionListDescription>
                <LocalTimestamp timestamp={anarchyGovernor.metadata.creationTimestamp}/>
                {' '}
                (<TimeInterval toTimestamp={anarchyGovernor.metadata.creationTimestamp}/>)
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        </Tab>
        <Tab eventKey="anarchysubjects" title={<TabTitleText>AnarchySubjects</TabTitleText>}>
          <AnarchySubjectsTable
            anarchySubjects={anarchySubjects}
            fetchState={anarchySubjectsFetchState}
            selectedUids={selectedAnarchySubjectUids}
            selectedUidsReducer={reduceAnarchySubjectSelectedUids}
          />
        </Tab>
        <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
          <Editor
            height="500px"
            language="yaml"
            options={{readOnly: true}}
            theme="vs-dark"
            value={yaml.dump(anarchyGovernor)}
          />
        </Tab>
      </Tabs>
    </PageSection>
  </>);
}

export default AnarchyGovernorInstance;
