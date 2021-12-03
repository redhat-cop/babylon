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
  AnarchyRun,
  deleteAnarchyRun,
  getAnarchyRun,
} from '@app/api';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import { AnsibleRunLog } from '@app/components/AnsibleRunLog';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { TimeInterval } from '@app/components/TimeInterval';
import { selectConsoleURL } from '@app/store';
import { OpenshiftConsoleLink } from './OpenshiftConsoleLink';
  
import './admin.css';

export interface AnarchyRunInstanceProps {
  location?: any;
}

const AnarchyRunInstance: React.FunctionComponent<AnarchyRunInstanceProps> = ({
  location,
}) => {
  const consoleURL = useSelector(selectConsoleURL);
  const history = useHistory();
  const locationMatch = location.pathname.match(/^(.*\/anarchyruns)\/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?$/);
  const basePath = locationMatch[1];
  const anarchyRunName = locationMatch[3];
  const anarchyRunNamespace = locationMatch[2];
  const activeTab = locationMatch[4] || 'details';

  const [anarchyRun, setAnarchyRun] = useState(undefined);

  async function confirmThenDelete() {
    if (confirm(`Delete AnarchyRun ${anarchyRunName}?`)) {
      await deleteAnarchyRun(anarchyRun);
      history.push(`${basePath}/${anarchyRunNamespace}`);
    }
  }

  async function fetchAnarchyRun() {
    try {
      const result:AnarchyRun = await getAnarchyRun(anarchyRunNamespace, anarchyRunName);
      setAnarchyRun(result);
    } catch (err) {
      setAnarchyRun(null);
    }
  }

  useEffect(() => {
    fetchAnarchyRun()
  }, [anarchyRunName]);

  if (anarchyRun === undefined) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  } else if (anarchyRun === null) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            AnarchyRun not found
          </Title>
          <EmptyStateBody>
            AnarchyRun {anarchyRunName} was not found in namespace {anarchyRunNamespace}.
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Breadcrumb>
        <BreadcrumbItem
          render={({ className }) => <Link to={basePath} className={className}>AnarchyRuns</Link>}
        />
        <BreadcrumbItem
          render={({ className }) => <Link to={`${basePath}/${anarchyRunNamespace}`} className={className}>{anarchyRunNamespace}</Link>}
        />
        <BreadcrumbItem>{ anarchyRun.metadata.name }</BreadcrumbItem>
      </Breadcrumb>
      <Split>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">AnarchyRun {anarchyRun.metadata.name}</Title>
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
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${anarchyRun.metadata.namespace}/${anarchyRun.apiVersion.replace('/', '~')}~${anarchyRun.kind}/${anarchyRun.metadata.name}/yaml`)}
              />,
              <ActionDropdownItem
                key="openInOpenShift"
                label="Open in OpenShift Console"
                onSelect={() => window.open(`${consoleURL}/k8s/ns/${anarchyRun.metadata.namespace}/${anarchyRun.apiVersion.replace('/', '~')}~${anarchyRun.kind}/${anarchyRun.metadata.name}`)}
              />
            ]}
          />
        </SplitItem>
      </Split>
    </PageSection>
    <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
      <Tabs activeKey={activeTab} onSelect={(e, tabIndex) => history.push(`${basePath}/${anarchyRunNamespace}/${anarchyRunName}/${tabIndex}`)}>
        <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>Name</DescriptionListTerm>
              <DescriptionListDescription>
                {anarchyRun.metadata.name}
                <OpenshiftConsoleLink resource={anarchyRun}/>
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Namespace</DescriptionListTerm>
              <DescriptionListDescription>
                {anarchyRun.metadata.namespace}
                <OpenshiftConsoleLink resource={anarchyRun} linkToNamespace={true}/>
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Created At</DescriptionListTerm>
              <DescriptionListDescription>
                <LocalTimestamp timestamp={anarchyRun.metadata.creationTimestamp}/>
                {' '}
                (<TimeInterval to={anarchyRun.metadata.creationTimestamp}/>)
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>AnarchyGovernor</DescriptionListTerm>
              <DescriptionListDescription>
                <Link to={`/admin/anarchygovernors/${anarchyRun.spec.governor.namespace}/${anarchyRun.spec.governor.name}`}>{anarchyRun.spec.governor.name}</Link>
                <OpenshiftConsoleLink reference={anarchyRun.spec.governor}/>
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>AnarchySubject</DescriptionListTerm>
              <DescriptionListDescription>
                <Link to={`/admin/anarchysubjects/${anarchyRun.spec.subject.namespace}/${anarchyRun.spec.subject.name}`}>{anarchyRun.spec.subject.name}</Link>
                <OpenshiftConsoleLink reference={anarchyRun.spec.subject}/>
              </DescriptionListDescription>
            </DescriptionListGroup>
            { anarchyRun.spec.action ? (
              <DescriptionListGroup>
                <DescriptionListTerm>AnarchyAction</DescriptionListTerm>
                <DescriptionListDescription>
                  <Link to={`/admin/anarchyactions/${anarchyRun.spec.action.namespace}/${anarchyRun.spec.action.name}`}>{anarchyRun.spec.action.name}</Link>
                  <OpenshiftConsoleLink reference={anarchyRun.spec.action}/>
                </DescriptionListDescription>
              </DescriptionListGroup>
            ) : null }
            <DescriptionListGroup>
              <DescriptionListTerm>AnarchyRunner Pod</DescriptionListTerm>
              <DescriptionListDescription>
                { anarchyRun.status?.runnerPod ? (
                  <>
                    { anarchyRun.status.runnerPod.name }
                    <OpenshiftConsoleLink reference={anarchyRun.status.runnerPod}/>
                  </>
                ) : '-' }
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Ansible Galaxy Requirements</DescriptionListTerm>
              <DescriptionListDescription>
                <pre>{yaml.dump(anarchyRun.spec.ansibleGalaxyRequirements)}</pre>
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        </Tab>
        <Tab eventKey="log" title={<TabTitleText>Ansible Log</TabTitleText>}>
          { anarchyRun.status?.result?.ansibleRun ? (
            <AnsibleRunLog ansibleRun={anarchyRun.status.result.ansibleRun}/>
          ) : (
            <EmptyState variant="full">
              <EmptyStateIcon icon={ExclamationTriangleIcon} />
              <Title headingLevel="h1" size="lg">
                AnarchyRun log not available.
              </Title>
            </EmptyState>
          ) }
        </Tab>
        <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
          <Editor
            height="500px"
            language="yaml"
            options={{readOnly: true}}
            theme="vs-dark"
            value={yaml.dump(anarchyRun)}
          />
        </Tab>
      </Tabs>
    </PageSection>
  </>);
}

export default AnarchyRunInstance;
