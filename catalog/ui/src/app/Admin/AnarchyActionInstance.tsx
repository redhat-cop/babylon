import React from "react";
import { useEffect, useState } from "react";
import { Link, useHistory } from 'react-router-dom';
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
  AnarchyAction,
} from '@app/types';
import {
  deleteAnarchyAction,
  getAnarchyAction,
} from '@app/api';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';
  
import './admin.css';

export interface AnarchyActionInstanceProps {
  location?: any;
}

const AnarchyActionInstance: React.FunctionComponent<AnarchyActionInstanceProps> = ({
  location,
}) => {
  const consoleURL = useSelector(selectConsoleURL);
  const history = useHistory();
  const locationMatch = location.pathname.match(/^(.*\/anarchyactions)\/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?$/);
  const basePath = locationMatch[1];
  const anarchyActionName = locationMatch[3];
  const anarchyActionNamespace = locationMatch[2];
  const activeTab = locationMatch[4] || 'details';

  const [anarchyAction, setAnarchyAction] = useState(undefined);

  async function confirmThenDelete() {
    if (confirm(`Delete AnarchyAction ${anarchyActionName}?`)) {
      await deleteAnarchyAction(anarchyAction);
      history.push(`${basePath}/${anarchyActionNamespace}`);
    }
  }

  async function fetchAnarchyAction() {
    try {
      const result:AnarchyAction = await getAnarchyAction(anarchyActionNamespace, anarchyActionName);
      setAnarchyAction(result);
    } catch (err) {
      setAnarchyAction(null);
    }
  }

  useEffect(() => {
    fetchAnarchyAction()
  }, [anarchyActionName]);

  if (anarchyAction === undefined) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  } else if (anarchyAction === null) {
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
  }

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Breadcrumb>
        <BreadcrumbItem
          render={({ className }) => <Link to={basePath} className={className}>AnarchyActions</Link>}
        />
        <BreadcrumbItem
          render={({ className }) => <Link to={`${basePath}/${anarchyActionNamespace}`} className={className}>{anarchyActionNamespace}</Link>}
        />
        <BreadcrumbItem>{ anarchyAction.metadata.name }</BreadcrumbItem>
      </Breadcrumb>
      <Split>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">AnarchyAction {anarchyAction.metadata.name}</Title>
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
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${anarchyAction.metadata.namespace}/${anarchyAction.apiVersion.replace('/', '~')}~${anarchyAction.kind}/${anarchyAction.metadata.name}/yaml`)}
              />,
              <ActionDropdownItem
                key="openInOpenShift"
                label="Open in OpenShift Console"
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${anarchyAction.metadata.namespace}/${anarchyAction.apiVersion.replace('/', '~')}~${anarchyAction.kind}/${anarchyAction.metadata.name}`)}
              />
            ]}
          />
        </SplitItem>
      </Split>
    </PageSection>
    <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
      <Tabs activeKey={activeTab} onSelect={(e, tabIndex) => history.push(`${basePath}/${anarchyActionNamespace}/${anarchyActionName}/${tabIndex}`)}>
        <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>Name</DescriptionListTerm>
              <DescriptionListDescription>
                {anarchyAction.metadata.name}
                <OpenshiftConsoleLink resource={anarchyAction}/>
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Created At</DescriptionListTerm>
              <DescriptionListDescription>
                <LocalTimestamp timestamp={anarchyAction.metadata.creationTimestamp}/>
                {' '}
                (<TimeInterval toTimestamp={anarchyAction.metadata.creationTimestamp}/>)
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Action</DescriptionListTerm>
              <DescriptionListDescription>{anarchyAction.spec.action}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>AnarchyGovernor</DescriptionListTerm>
              <DescriptionListDescription>
                <Link to={`/admin/anarchygovernors/${anarchyAction.spec.governorRef.namespace}/${anarchyAction.spec.governorRef.name}`}>{anarchyAction.spec.governorRef.name}</Link>
                <OpenshiftConsoleLink reference={anarchyAction.spec.governorRef}/>
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>AnarchySubject</DescriptionListTerm>
              <DescriptionListDescription>
                <Link to={`/admin/anarchysubjects/${anarchyAction.spec.subjectRef.namespace}/${anarchyAction.spec.subjectRef.name}`}>{anarchyAction.spec.subjectRef.name}</Link>
                <OpenshiftConsoleLink reference={anarchyAction.spec.subjectRef}/>
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>AnarchyRun</DescriptionListTerm>
              <DescriptionListDescription>
                { anarchyAction.status?.runRef ? (
                  <>
                    <Link key="admin" to={`/admin/anarchyruns/${anarchyAction.status.runRef.namespace}/${anarchyAction.status.runRef.name}`}>{anarchyAction.status.runRef.name}</Link>
                    <OpenshiftConsoleLink key="console" reference={anarchyAction.status.runRef}/>
                 </>
                ) : '-' }
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        </Tab>
        <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
          <Editor
            height="500px"
            language="yaml"
            options={{readOnly: true}}
            theme="vs-dark"
            value={yaml.dump(anarchyAction)}
          />
        </Tab>
      </Tabs>
    </PageSection>
  </>);
}

export default AnarchyActionInstance;
