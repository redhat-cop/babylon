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
  AnarchyGovernor,
  deleteAnarchyGovernor,
  getAnarchyGovernor,
} from '@app/api';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { TimeInterval } from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';
import OpenshiftConsoleLink from './OpenshiftConsoleLink';
  
import './admin.css';

export interface AnarchyGovernorInstanceProps {
  location?: any;
}

const AnarchyGovernorInstance: React.FunctionComponent<AnarchyGovernorInstanceProps> = ({
  location,
}) => {
  const consoleURL = useSelector(selectConsoleURL);
  const history = useHistory();
  const locationMatch = location.pathname.match(/^(.*\/anarchygovernors)\/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?$/);
  const basePath = locationMatch[1];
  const anarchyGovernorName = locationMatch[3];
  const anarchyGovernorNamespace = locationMatch[2];
  const activeTab = locationMatch[4] || 'details';

  const [anarchyGovernor, setAnarchyGovernor] = useState(undefined);

  async function confirmThenDelete() {
    if (confirm(`Delete AnarchyGovernor ${anarchyGovernorName}?`)) {
      await deleteAnarchyGovernor(anarchyGovernor);
      history.push(`${basePath}/${anarchyGovernorNamespace}`);
    }
  }

  async function fetchAnarchyGovernor() {
    try {
      const result:AnarchyGovernor = await getAnarchyGovernor(anarchyGovernorNamespace, anarchyGovernorName);
      setAnarchyGovernor(result);
    } catch (err) {
      setAnarchyGovernor(null);
    }
  }

  useEffect(() => {
    fetchAnarchyGovernor()
  }, [anarchyGovernorName]);

  if (anarchyGovernor === undefined) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  } else if (anarchyGovernor === null) {
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
  }

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Breadcrumb>
        <BreadcrumbItem
          render={({ className }) => <Link to={basePath} className={className}>AnarchyGovernors</Link>}
        />
        <BreadcrumbItem
          render={({ className }) => <Link to={`${basePath}/${anarchyGovernorNamespace}`} className={className}>{anarchyGovernorNamespace}</Link>}
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
      <Tabs activeKey={activeTab} onSelect={(e, tabIndex) => history.push(`${basePath}/${anarchyGovernorNamespace}/${anarchyGovernorName}/${tabIndex}`)}>
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
                (<TimeInterval to={anarchyGovernor.metadata.creationTimestamp}/>)
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
            value={yaml.dump(anarchyGovernor)}
          />
        </Tab>
      </Tabs>
    </PageSection>
  </>);
}

export default AnarchyGovernorInstance;
