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

import { deleteAnarchyGovernor, deleteAnarchySubject, getAnarchyGovernor, listAnarchySubjects } from '@app/api';

import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchyGovernor, AnarchySubject, AnarchySubjectList } from '@app/types';

import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';

import AnarchySubjectsTable from './AnarchySubjectsTable';

import './admin.css';

const AnarchyGovernorInstance: React.FC = () => {
  const navigate = useNavigate();
  const consoleURL = useSelector(selectConsoleURL);
  const componentWillUnmount = useRef(false);
  const { name: anarchyGovernorName, namespace: anarchyGovernorNamespace, tab: activeTab = 'details' } = useParams();

  const [anarchyGovernorFetchState, reduceAnarchyGovernorFetchState] = useReducer(k8sFetchStateReducer, null);
  const [anarchySubjectsFetchState, reduceAnarchySubjectsFetchState] = useReducer(k8sFetchStateReducer, null);
  const [selectedAnarchySubjectUids, reduceAnarchySubjectSelectedUids] = useReducer(selectedUidsReducer, []);

  const anarchyGovernor: AnarchyGovernor | null = (anarchyGovernorFetchState?.item as AnarchyGovernor) || null;
  const anarchySubjects: AnarchySubject[] = (anarchySubjectsFetchState?.items as AnarchySubject[]) || [];

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete AnarchyGovernor ${anarchyGovernorName}?`)) {
      await deleteAnarchyGovernor(anarchyGovernor);
      navigate(`/admin/anarchygovernors/${anarchyGovernorNamespace}`);
    }
  }

  async function confirmThenDeleteAnarchySubjects(): Promise<void> {
    if (confirm(`Delete selected AnarchySubjects?`)) {
      const removedAnarchySubjects: AnarchySubject[] = [];
      for (const anarchySubject of anarchySubjects) {
        if (selectedAnarchySubjectUids.includes(anarchySubject.metadata.uid)) {
          await deleteAnarchySubject(anarchySubject);
          removedAnarchySubjects.push(anarchySubject);
        }
      }
      reduceAnarchySubjectSelectedUids({ type: 'clear' });
      reduceAnarchySubjectsFetchState({ type: 'removeItems', items: removedAnarchySubjects });
    }
  }

  async function fetchAnarchyGovernor(): Promise<void> {
    let anarchyGovernor: AnarchyGovernor = null;
    try {
      anarchyGovernor = await getAnarchyGovernor(anarchyGovernorNamespace, anarchyGovernorName);
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 404) {
        throw error;
      }
    }
    if (!anarchyGovernorFetchState.activity.canceled) {
      reduceAnarchyGovernorFetchState({
        type: 'post',
        item: anarchyGovernor,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceAnarchyGovernorFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  async function fetchAnarchySubjects(): Promise<void> {
    const anarchySubjectList: AnarchySubjectList = await listAnarchySubjects({
      labelSelector: `anarchy.gpte.redhat.com/governor=${anarchyGovernorName}`,
      namespace: anarchyGovernorNamespace,
    });
    if (!anarchySubjectsFetchState.activity.canceled) {
      reduceAnarchySubjectsFetchState({
        type: 'post',
        k8sObjectList: anarchySubjectList,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceAnarchySubjectsFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  // First render and detect unmount
  useEffect(() => {
    reduceAnarchyGovernorFetchState({ type: 'startFetch' });
    reduceAnarchySubjectsFetchState({ type: 'startFetch' });
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  useEffect(() => {
    if (anarchyGovernorFetchState?.canContinue) {
      fetchAnarchyGovernor();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(anarchyGovernorFetchState);
      }
    };
  }, [anarchyGovernorFetchState]);

  useEffect(() => {
    if (anarchySubjectsFetchState?.canContinue) {
      fetchAnarchySubjects();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(anarchySubjectsFetchState);
      }
    };
  }, [anarchySubjectsFetchState]);

  if (!anarchyGovernor) {
    if (anarchyGovernorFetchState?.finished) {
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
              <Link to={`/admin/anarchygovernors/${anarchyGovernorNamespace}`} className={className}>
                {anarchyGovernorNamespace}
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
                      `${consoleURL}/k8s/ns/${anarchyGovernor.metadata.namespace}/${anarchyGovernor.apiVersion.replace(
                        '/',
                        '~'
                      )}~${anarchyGovernor.kind}/${anarchyGovernor.metadata.name}/yaml`
                    )
                  }
                />,
                <ActionDropdownItem
                  key="openInOpenShift"
                  label="Open in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleURL}/k8s/ns/${anarchyGovernor.metadata.namespace}/${anarchyGovernor.apiVersion.replace(
                        '/',
                        '~'
                      )}~${anarchyGovernor.kind}/${anarchyGovernor.metadata.name}`
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
            navigate(`/admin/anarchygovernors/${anarchyGovernorNamespace}/${anarchyGovernorName}/${tabIndex}`)
          }
        >
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

export default AnarchyGovernorInstance;
