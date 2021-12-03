import React from "react";
import { useEffect, useState } from "react";
import { Link, useHistory } from 'react-router-dom';
import {
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import {
  AnarchyRun,
  AnarchyRunner,
  deleteAnarchyRun,
  listAnarchyRuns,
  listAnarchyRunners,
} from '@app/api';
import { RedoIcon } from '@patternfly/react-icons';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { SelectableTable } from '@app/components/SelectableTable';
import { TimeInterval } from '@app/components/TimeInterval';
import { AnarchyNamespaceSelect } from './AnarchyNamespaceSelect';
import { AnarchyRunnerStateSelect } from './AnarchyRunnerStateSelect';
import { OpenshiftConsoleLink } from './OpenshiftConsoleLink';

import './admin.css';

export interface AnarchyRunsProps {
  location?: any;
}

const AnarchyRuns: React.FunctionComponent<AnarchyRunsProps> = ({
  location,
}) => {
  const history = useHistory();
  const locationMatch = location.pathname.match(/^(.*\/anarchyruns)(?:\/([^\/]+))?$/);
  const urlParams = new URLSearchParams(location.search);
  const runnerStateFilter = urlParams.get('runnerState');

  const basePath = locationMatch[1];
  const anarchyNamespace = locationMatch[2];

  const [anarchyRuns, setAnarchyRuns] = useState(undefined);
  const [selectedAnarchyRunUids, setSelectedAnarchyRunUids] = React.useState([]);

  async function confirmThenDelete() {
    if (confirm("Deleted selected AnarchyRuns?")) {
      const anarchyRunsToDelete = anarchyRuns.filter(anarchyRun => selectedAnarchyRunUids.includes(anarchyRun.metadata.uid));
      setAnarchyRuns(undefined);
      for (const anarchyRun of anarchyRunsToDelete) {
        if (selectedAnarchyRunUids.includes(anarchyRun.metadata.uid)) {
          await deleteAnarchyRun(anarchyRun);
        }
      }
      await fetchAnarchyRuns();
    }
  }

  async function fetchAnarchyRuns() {
    const fetchedUids = [];
    let listContinue:string = null;
    let newFetchStarted = false;
    setAnarchyRuns(undefined);
    setSelectedAnarchyRunUids([]);

    const labelSelectors = [];
    if (runnerStateFilter) {
      if (runnerStateFilter === "running") {
        const anarchyRunnerList = await listAnarchyRunners({namespace: anarchyNamespace});
        const anarchyRunnerPodNames = [];
        for (const anarchyRunner of anarchyRunnerList.items || []) {
          anarchyRunnerPodNames.push(...(anarchyRunner.status?.pods || []).map(p => p.name));
        }
        labelSelectors.push(`anarchy.gpte.redhat.com/runner in (${anarchyRunnerPodNames.join(', ')})`);
      } else {
        labelSelectors.push(`anarchy.gpte.redhat.com/runner=${runnerStateFilter}`);
      }
    }

    while (true) {
      const anarchyRunList = await listAnarchyRuns({
        continue: listContinue,
        labelSelector: (labelSelectors.length > 0 ? labelSelectors.join(', ') : null),
        limit: 20,
        namespace: anarchyNamespace,
      });
      const newAnarchyRuns = (anarchyRunList.items || []).map(anarchyRun => {
        return {
          apiVersion: anarchyRun.apiVersion,
          kind: anarchyRun.kind,
          metadata: {
            creationTimestamp: anarchyRun.metadata.creationTimestamp,
            name: anarchyRun.metadata.name,
            namespace: anarchyRun.metadata.namespace,
            uid: anarchyRun.metadata.uid,
          },
          spec: {
            action: {
              apiVersion: anarchyRun.spec.action?.apiVersion,
              kind: anarchyRun.spec.action?.kind,
              name: anarchyRun.spec.action?.name,
              namespace: anarchyRun.spec.action?.namespace,
            },
            actionConfig: {
              name: anarchyRun.spec.actionConfig?.name,
            },
            governor: {
              apiVersion: anarchyRun.spec.governor?.apiVersion,
              kind: anarchyRun.spec.governor?.kind,
              name: anarchyRun.spec.governor?.name,
              namespace: anarchyRun.spec.governor?.namespace,
            },
            subject: {
              apiVersion: anarchyRun.spec.subject?.apiVersion,
              kind: anarchyRun.spec.subject?.kind,
              name: anarchyRun.spec.subject?.name,
              namespace: anarchyRun.spec.subject?.namespace,
            },
          },
          status: {
            result: {
              status: anarchyRun.status?.result?.status,
            },
            runPostTimestamp: {
              status: anarchyRun.status?.runPostTimestamp,
            },
            runner: anarchyRun.status?.runner,
            runnerPod: anarchyRun.status?.runnerPod,
          }
        };
      });
      setAnarchyRuns((value) => {
        const previousAnarchyRuns = value || [];
        const previousUids = previousAnarchyRuns.map(a => a.metadata.uid);
        if (fetchedUids.length == previousUids.length 
        && fetchedUids.every((uid, idx) => uid === previousUids[idx])) {
          fetchedUids.push(...newAnarchyRuns.map(a => a.metadata.uid));
          return [...previousAnarchyRuns, ...newAnarchyRuns];
        } else {
          newFetchStarted = true;
          return previousAnarchyRuns;
        }
      });
      if (newFetchStarted) {
        break;
      }
      listContinue = anarchyRunList.metadata.continue as string;
      if (!listContinue) {
        break;
      }
    }
  }

  useEffect(() => {
    fetchAnarchyRuns();
  }, [anarchyNamespace, runnerStateFilter]);

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Split hasGutter>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">AnarchyRuns</Title>
        </SplitItem>
        <SplitItem>
          <Button
            icon={<RedoIcon/>}
            onClick={() => {
              setAnarchyRuns(undefined);
              fetchAnarchyRuns();
            }}
            variant="tertiary"
          >Refresh</Button>
        </SplitItem>
        <SplitItem>
          <AnarchyRunnerStateSelect
            runnerState={runnerStateFilter}
            onSelect={(runnerState) => {
              const qualifiedPath = anarchyNamespace ? `${basePath}/${anarchyNamespace}` : basePath;
              console.log(`runnerState: ${runnerState}`);
              if (runnerState) {
                history.push(`${qualifiedPath}?runnerState=${runnerState}`);
              } else {
                history.push(`${qualifiedPath}`);
              }
            }}
          />
        </SplitItem>
        <SplitItem>
          <AnarchyNamespaceSelect
            namespace={anarchyNamespace}
            onSelect={(namespaceName) => {
              if (namespaceName) {
                history.push(`${basePath}/${namespaceName}${location.search}`);
              } else {
                history.push(`${basePath}${location.search}`);
              }
            }}
          />
        </SplitItem>
        <SplitItem>
          <ActionDropdown
            position="right"
            actionDropdownItems={[
              <ActionDropdownItem
                key="delete"
                label="Delete Selected"
                onSelect={() => confirmThenDelete()}
              />,
            ]}
          />
        </SplitItem>
      </Split>
    </PageSection>
    { anarchyRuns === undefined ? (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    ) : anarchyRuns.length === 0 ? (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No AnarchyRuns found
          </Title>
        </EmptyState>
      </PageSection>
    ) : (
      <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
        <SelectableTable
          columns={['Namespace', 'Name', 'AnarchySubject', 'AnarchyAction', 'Created At']}
          onSelectAll={(isSelected) => {
            if (isSelected) {
              setSelectedAnarchyRunUids(anarchyRuns.map(anarchyRun => anarchyRun.metadata.uid));
            } else {
              setSelectedAnarchyRunUids([]);
            }
          }}
          rows={anarchyRuns.map((anarchyRun:AnarchyRun) => {
            return {
              cells: [
                <>
                  {anarchyRun.metadata.namespace}
                  <OpenshiftConsoleLink key="console" resource={anarchyRun} linkToNamespace={true}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchyruns/${anarchyRun.metadata.namespace}/${anarchyRun.metadata.name}`}>{anarchyRun.metadata.name}</Link>
                  <OpenshiftConsoleLink key="console" resource={anarchyRun}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchysubjects/${anarchyRun.spec.subject.namespace}/${anarchyRun.spec.subject.name}`}>{anarchyRun.spec.subject.name}</Link>
                  <OpenshiftConsoleLink key="console" reference={anarchyRun.spec.subject}/>
                </>,
                anarchyRun.spec.action ? (
                  <>
                    <Link key="admin" to={`/admin/anarchyactions/${anarchyRun.spec.action.namespace}/${anarchyRun.spec.action.name}`}>{anarchyRun.spec.action.name}</Link>
                    <OpenshiftConsoleLink key="console" reference={anarchyRun.spec.subject}/>
                  </>
                ) : '-',
                <>
                  <LocalTimestamp key="timestamp" timestamp={anarchyRun.metadata.creationTimestamp}/>
                  {' '}
                  (<TimeInterval key="interval" to={anarchyRun.metadata.creationTimestamp}/>)
                </>,
              ],
              onSelect: (isSelected) => setSelectedAnarchyRunUids(uids => {
                if (isSelected) {
                  if (selectedAnarchyRunUids.includes(anarchyRun.metadata.uid)) {
                    return selectedAnarchyRunUids;
                  } else {
                    return [...selectedAnarchyRunUids, anarchyRun.metadata.uid];
                  }
                } else {
                  return uids.filter(uid => uid !== anarchyRun.metadata.uid);
                }
              }),
              selected: selectedAnarchyRunUids.includes(anarchyRun.metadata.uid),
            };
          })}
        />
      </PageSection>
    )}
  </>);
}

export default AnarchyRuns;
