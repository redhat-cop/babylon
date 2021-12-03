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
  AnarchyAction,
  deleteAnarchyAction,
  listAnarchyActions,
} from '@app/api';
import { RedoIcon } from '@patternfly/react-icons';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { SelectableTable } from '@app/components/SelectableTable';
import { TimeInterval } from '@app/components/TimeInterval';
import { AnarchyActionSelect } from './AnarchyActionSelect';
import { AnarchyNamespaceSelect } from './AnarchyNamespaceSelect';
import { OpenshiftConsoleLink } from './OpenshiftConsoleLink';

import './admin.css';

export interface AnarchyActionsProps {
  location?: any;
}

const AnarchyActions: React.FunctionComponent<AnarchyActionsProps> = ({
  location,
}) => {
  const history = useHistory();
  const locationMatch = location.pathname.match(/^(.*\/anarchyactions)(?:\/([^\/]+))?$/);
  const urlParams = new URLSearchParams(location.search);
  const actionFilter = urlParams.get('action');

  const basePath = locationMatch[1];
  const anarchyNamespace = locationMatch[2];

  const [anarchyActions, setAnarchyActions] = useState(undefined);
  const [selectedAnarchyActionUids, setSelectedAnarchyActionUids] = React.useState([]);

  async function confirmThenDelete() {
    if (confirm("Deleted selected AnarchyActions?")) {
      const anarchyActionsToDelete = anarchyActions.filter(anarchyAction => selectedAnarchyActionUids.includes(anarchyAction.metadata.uid));
      setAnarchyActions(undefined);
      for (const anarchyAction of anarchyActionsToDelete) {
        if (selectedAnarchyActionUids.includes(anarchyAction.metadata.uid)) {
          await deleteAnarchyAction(anarchyAction);
        }
      }
      await fetchAnarchyActions();
    }
  }

  async function fetchAnarchyActions() {
    const fetchedUids = [];
    let listContinue:string = null;
    let newFetchStarted = false;
    setAnarchyActions(undefined);
    setSelectedAnarchyActionUids([]);
    while (true) {
      const anarchyActionList = await listAnarchyActions({
        continue: listContinue,
        labelSelector: actionFilter ? `anarchy.gpte.redhat.com/action=${actionFilter}` : null,
        limit: 20,
        namespace: anarchyNamespace,
      });
      const newAnarchyActions = (anarchyActionList.items || []).map(anarchyAction => {
        return {
          apiVersion: anarchyAction.apiVersion,
          kind: anarchyAction.kind,
          metadata: {
            creationTimestamp: anarchyAction.metadata.creationTimestamp,
            name: anarchyAction.metadata.name,
            namespace: anarchyAction.metadata.namespace,
            uid: anarchyAction.metadata.uid,
          },
          spec: {
            action: anarchyAction.spec.action,
            governorRef: anarchyAction.spec.governorRef,
            subjectRef: anarchyAction.spec.subjectRef,
          },
          status: {
            finishedTimestamp: anarchyAction.status?.finishedTimestamp,
            state: anarchyAction.status?.state,
          }
        };
      });
      setAnarchyActions((value) => {
        const previousAnarchyActions = value || [];
        const previousUids = previousAnarchyActions.map(a => a.metadata.uid);
        if (fetchedUids.length == previousUids.length 
        && fetchedUids.every((uid, idx) => uid === previousUids[idx])) {
          fetchedUids.push(...newAnarchyActions.map(a => a.metadata.uid));
          return [...previousAnarchyActions, ...newAnarchyActions];
        } else {
          newFetchStarted = true;
          return previousAnarchyActions;
        }
      });
      if (newFetchStarted) {
        break;
      }
      listContinue = anarchyActionList.metadata.continue as string;
      if (!listContinue) {
        break;
      }
    }
  }

  useEffect(() => {
    fetchAnarchyActions();
  }, [anarchyNamespace, actionFilter]);

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Split hasGutter>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">AnarchyActions</Title>
        </SplitItem>
        <SplitItem>
          <Button
            icon={<RedoIcon/>}
            onClick={() => {
              setAnarchyActions(undefined);
              fetchAnarchyActions();
            }}
            variant="tertiary"
          >Refresh</Button>
        </SplitItem>
        <SplitItem>
          <AnarchyActionSelect
            action={actionFilter}
            onSelect={(action) => {
              const qualifiedPath = anarchyNamespace ? `${basePath}/${anarchyNamespace}` : basePath;
              if (action) {
                history.push(`${qualifiedPath}?action=${action}`);
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
    { anarchyActions === undefined ? (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    ) : anarchyActions.length === 0 ? (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No AnarchyActions found
          </Title>
        </EmptyState>
      </PageSection>
    ) : (
      <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
        <SelectableTable
          columns={['Namespace', 'Name', 'AnarchySubject', 'AnarchyGovernor', 'Created At', 'State', 'Finished At']}
          onSelectAll={(isSelected) => {
            if (isSelected) {
              setSelectedAnarchyActionUids(anarchyActions.map(anarchyAction => anarchyAction.metadata.uid));
            } else {
              setSelectedAnarchyActionUids([]);
            }
          }}
          rows={anarchyActions.map((anarchyAction:AnarchyAction) => {
            return {
              cells: [
                <>
                  {anarchyAction.metadata.namespace}
                  <OpenshiftConsoleLink key="console" resource={anarchyAction} linkToNamespace={true}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchyactions/${anarchyAction.metadata.namespace}/${anarchyAction.metadata.name}`}>{anarchyAction.metadata.name}</Link>
                  <OpenshiftConsoleLink key="console" resource={anarchyAction}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchysubjects/${anarchyAction.spec.subjectRef.namespace}/${anarchyAction.spec.subjectRef.name}`}>{anarchyAction.spec.subjectRef.name}</Link>
                  <OpenshiftConsoleLink key="console" reference={anarchyAction.spec.subjectRef}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchygovernors/${anarchyAction.spec.governorRef.namespace}/${anarchyAction.spec.governorRef.name}`}>{anarchyAction.spec.governorRef.name}</Link>
                  <OpenshiftConsoleLink key="console" reference={anarchyAction.spec.governorRef}/>
                </>,
                <>
                  <LocalTimestamp key="timestamp" timestamp={anarchyAction.metadata.creationTimestamp}/>
                  {' '}
                  (<TimeInterval key="interval" to={anarchyAction.metadata.creationTimestamp}/>)
                </>,
                <>
                  {anarchyAction.status?.state || '-'}
                </>,
                anarchyAction.status?.finishedTimestamp ? (
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchyAction.status.finishedTimestamp}/>
                    {' '}
                    (<TimeInterval key="interval" to={anarchyAction.status.finishedTimestamp}/>)
                  </>
                ) : '-',
              ],
              onSelect: (isSelected) => setSelectedAnarchyActionUids(uids => {
                if (isSelected) {
                  if (selectedAnarchyActionUids.includes(anarchyAction.metadata.uid)) {
                    return selectedAnarchyActionUids;
                  } else {
                    return [...selectedAnarchyActionUids, anarchyAction.metadata.uid];
                  }
                } else {
                  return uids.filter(uid => uid !== anarchyAction.metadata.uid);
                }
              }),
              selected: selectedAnarchyActionUids.includes(anarchyAction.metadata.uid),
            };
          })}
        />
      </PageSection>
    )}
  </>);
}

export default AnarchyActions;
