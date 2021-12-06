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
  AnarchySubject,
  deleteAnarchySubject,
  listAnarchySubjects,
} from '@app/api';
import { RedoIcon } from '@patternfly/react-icons';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { SelectableTable } from '@app/components/SelectableTable';
import { TimeInterval } from '@app/components/TimeInterval';
import { AnarchyNamespaceSelect } from './AnarchyNamespaceSelect';
import { AnarchySubjectStateSelect } from './AnarchySubjectStateSelect';
import OpenshiftConsoleLink from './OpenshiftConsoleLink';

import './admin.css';

export interface AnarchySubjectsProps {
  location?: any;
}

const AnarchySubjects: React.FunctionComponent<AnarchySubjectsProps> = ({
  location,
}) => {
  const history = useHistory();
  const locationMatch = location.pathname.match(/^(.*\/anarchysubjects)(?:\/([^\/]+))?$/);
  const urlParams = new URLSearchParams(location.search);
  const stateFilter = urlParams.get('state');

  const basePath = locationMatch[1];
  const anarchyNamespace = locationMatch[2];

  const [anarchySubjects, setAnarchySubjects] = useState(undefined);
  const [selectedAnarchySubjectUids, setSelectedAnarchySubjectUids] = React.useState([]);

  async function confirmThenDelete() {
    if (confirm("Deleted selected AnarchySubjects?")) {
      const anarchySubjectsToDelete = anarchySubjects.filter(anarchySubject => selectedAnarchySubjectUids.includes(anarchySubject.metadata.uid));
      setAnarchySubjects(undefined);
      for (const anarchySubject of anarchySubjectsToDelete) {
        if (selectedAnarchySubjectUids.includes(anarchySubject.metadata.uid)) {
          await deleteAnarchySubject(anarchySubject);
        }
      }
      await fetchAnarchySubjects();
    }
  }

  async function fetchAnarchySubjects() {
    const fetchedUids = [];
    let listContinue:string = null;
    let newFetchStarted = false;
    setAnarchySubjects(undefined);
    setSelectedAnarchySubjectUids([]);
    while (true) {
      const anarchySubjectList = await listAnarchySubjects({
        continue: listContinue,
        labelSelector: stateFilter ? `state=${stateFilter}` : null,
        limit: 20,
        namespace: anarchyNamespace,
      });
      const newAnarchySubjects = (anarchySubjectList.items || []).map(anarchySubject => {
        return {
          apiVersion: anarchySubject.apiVersion,
          kind: anarchySubject.kind,
          metadata: {
            creationTimestamp: anarchySubject.metadata.creationTimestamp,
            deletionTimestamp: anarchySubject.metadata.deletionTimestamp,
            name: anarchySubject.metadata.name,
            namespace: anarchySubject.metadata.namespace,
            uid: anarchySubject.metadata.uid,
          },
          spec: {
            governor: anarchySubject.spec.governor,
          },
        };
      });
      setAnarchySubjects((value) => {
        const previousAnarchySubjects = value || [];
        const previousUids = previousAnarchySubjects.map(a => a.metadata.uid);
        if (fetchedUids.length == previousUids.length 
        && fetchedUids.every((uid, idx) => uid === previousUids[idx])) {
          fetchedUids.push(...newAnarchySubjects.map(a => a.metadata.uid));
          return [...previousAnarchySubjects, ...newAnarchySubjects];
        } else {
          newFetchStarted = true;
          return previousAnarchySubjects;
        }
      });
      if (newFetchStarted) {
        break;
      }
      listContinue = anarchySubjectList.metadata.continue as string;
      if (!listContinue) {
        break;
      }
    }
  }

  useEffect(() => {
    fetchAnarchySubjects();
  }, [anarchyNamespace, stateFilter]);

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Split hasGutter>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">AnarchySubjects</Title>
        </SplitItem>
        <SplitItem>
          <Button
            icon={<RedoIcon/>}
            onClick={() => {
              setAnarchySubjects(undefined);
              fetchAnarchySubjects();
            }}
            variant="tertiary"
          >Refresh</Button>
        </SplitItem>
        <SplitItem>
          <AnarchySubjectStateSelect
            state={stateFilter}
            onSelect={(state) => {
              const qualifiedPath = anarchyNamespace ? `${basePath}/${anarchyNamespace}` : basePath;
              if (state) {
                history.push(`${qualifiedPath}?state=${state}`);
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
    { anarchySubjects === undefined ? (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    ) : anarchySubjects.length === 0 ? (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No AnarchySubjects found
          </Title>
        </EmptyState>
      </PageSection>
    ) : (
      <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
        <SelectableTable
          columns={['Namespace', 'Name', 'AnarchyGovernor', 'Created At', 'State', 'Deleted At']}
          onSelectAll={(isSelected) => {
            if (isSelected) {
              setSelectedAnarchySubjectUids(anarchySubjects.map(anarchySubject => anarchySubject.metadata.uid));
            } else {
              setSelectedAnarchySubjectUids([]);
            }
          }}
          rows={anarchySubjects.map((anarchySubject:AnarchySubject) => {
            return {
              cells: [
                <>
                  {anarchySubject.metadata.namespace}
                  <OpenshiftConsoleLink key="console" resource={anarchySubject} linkToNamespace={true}/>
                </>,
                <>
                  <Link key="admin" to={`${basePath}/${anarchySubject.metadata.namespace}/${anarchySubject.metadata.name}`}>{anarchySubject.metadata.name}</Link>
                  <OpenshiftConsoleLink key="console" resource={anarchySubject}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchygovernors/${anarchySubject.metadata.namespace}/${anarchySubject.spec.governor}`}>{anarchySubject.spec.governor}</Link>
                  <OpenshiftConsoleLink key="console" reference={{
                    apiVersion: anarchySubject.apiVersion,
                    kind: anarchySubject.kind,
                    name: anarchySubject.spec.governor,
                    namespace: anarchySubject.metadata.namespace,
                  }}/>
                </>,
                <>
                  <LocalTimestamp key="timestamp" timestamp={anarchySubject.metadata.creationTimestamp}/>
                  {' '}
                  (<TimeInterval key="interval" to={anarchySubject.metadata.creationTimestamp}/>)
                </>,
                anarchySubject.spec.vars?.currentState || '-',
                anarchySubject.metadata.deletionTimestamp ? (
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchySubject.metadata.deletionTimestamp}/>
                    {' '}
                    (<TimeInterval key="interval" to={anarchySubject.metadata.deletionTimestamp}/>)
                  </>
                ) : '-',
              ],
              onSelect: (isSelected) => setSelectedAnarchySubjectUids(uids => {
                if (isSelected) {
                  if (selectedAnarchySubjectUids.includes(anarchySubject.metadata.uid)) {
                    return selectedAnarchySubjectUids;
                  } else {
                    return [...selectedAnarchySubjectUids, anarchySubject.metadata.uid];
                  }
                } else {
                  return uids.filter(uid => uid !== anarchySubject.metadata.uid);
                }
              }),
              selected: selectedAnarchySubjectUids.includes(anarchySubject.metadata.uid),
            };
          })}
        />
      </PageSection>
    )}
  </>);
}

export default AnarchySubjects;
