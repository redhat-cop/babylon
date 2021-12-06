import React from "react";
import { useEffect, useState } from "react";
import { Link, useHistory } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
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
import Editor from "@monaco-editor/react";
const yaml = require('js-yaml');
import {
  AnarchySubject,
  deleteAnarchySubject,
  getAnarchySubject,
} from '@app/api';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { TimeInterval } from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';
import OpenshiftConsoleLink from './OpenshiftConsoleLink';
  
import './admin.css';

export interface AnarchySubjectInstanceProps {
  location?: any;
}

const AnarchySubjectInstance: React.FunctionComponent<AnarchySubjectInstanceProps> = ({
  location,
}) => {
  const consoleURL = useSelector(selectConsoleURL);
  const history = useHistory();
  const locationMatch = location.pathname.match(/^(.*\/anarchysubjects)\/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?$/);
  const basePath = locationMatch[1];
  const anarchySubjectName = locationMatch[3];
  const anarchySubjectNamespace = locationMatch[2];
  const activeTab = locationMatch[4] || 'details';

  const [anarchySubject, setAnarchySubject] = useState(undefined);

  async function confirmThenDelete() {
    if (confirm(`Delete AnarchySubject ${anarchySubjectName}?`)) {
      await deleteAnarchySubject(anarchySubject);
      history.push(`${basePath}/${anarchySubjectNamespace}`);
    }
  }

  async function fetchAnarchySubject() {
    try {
      const result:AnarchySubject = await getAnarchySubject(anarchySubjectNamespace, anarchySubjectName);
      setAnarchySubject(result);
    } catch (err) {
      setAnarchySubject(null);
    }
  }

  useEffect(() => {
    fetchAnarchySubject()
  }, [anarchySubjectName]);

  if (anarchySubject === undefined) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  } else if (anarchySubject === null) {
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
  }

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Breadcrumb>
        <BreadcrumbItem
          render={({ className }) => <Link to={basePath} className={className}>AnarchySubjects</Link>}
        />
        <BreadcrumbItem
          render={({ className }) => <Link to={`${basePath}/${anarchySubjectNamespace}`} className={className}>{anarchySubjectNamespace}</Link>}
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
      <Tabs activeKey={activeTab} onSelect={(e, tabIndex) => history.push(`${basePath}/${anarchySubjectNamespace}/${anarchySubjectName}/${tabIndex}`)}>
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
              <DescriptionListTerm>Created At</DescriptionListTerm>
              <DescriptionListDescription>
                <LocalTimestamp timestamp={anarchySubject.metadata.creationTimestamp}/>
                {' '}
                (<TimeInterval to={anarchySubject.metadata.creationTimestamp}/>)
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
            value={yaml.dump(anarchySubject)}
          />
        </Tab>
      </Tabs>
    </PageSection>
  </>);
}

export default AnarchySubjectInstance;
