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
  AnarchyGovernor,
  deleteAnarchyGovernor,
  listAnarchyGovernors,
} from '@app/api';
import { RedoIcon } from '@patternfly/react-icons';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { SelectableTable } from '@app/components/SelectableTable';
import { TimeInterval } from '@app/components/TimeInterval';
import { AnarchyNamespaceSelect } from './AnarchyNamespaceSelect';
import { OpenshiftConsoleLink } from './OpenshiftConsoleLink';

import './admin.css';

export interface AnarchyGovernorsProps {
  location?: any;
}

const AnarchyGovernors: React.FunctionComponent<AnarchyGovernorsProps> = ({
  location,
}) => {
  const history = useHistory();
  const locationMatch = location.pathname.match(/^(.*\/anarchygovernors)(?:\/([^\/]+))?$/);
  const urlParams = new URLSearchParams(location.search);
  const stateFilter = urlParams.get('state');

  const basePath = locationMatch[1];
  const anarchyNamespace = locationMatch[2];

  const [anarchyGovernors, setAnarchyGovernors] = useState(undefined);
  const [selectedAnarchyGovernorUids, setSelectedAnarchyGovernorUids] = React.useState([]);

  async function confirmThenDelete() {
    if (confirm("Deleted selected AnarchyGovernors?")) {
      const anarchyGovernorsToDelete = anarchyGovernors.filter(anarchyGovernor => selectedAnarchyGovernorUids.includes(anarchyGovernor.metadata.uid));
      setAnarchyGovernors(undefined);
      for (const anarchyGovernor of anarchyGovernorsToDelete) {
        if (selectedAnarchyGovernorUids.includes(anarchyGovernor.metadata.uid)) {
          await deleteAnarchyGovernor(anarchyGovernor);
        }
      }
      await fetchAnarchyGovernors();
    }
  }

  async function fetchAnarchyGovernors() {
    const fetchedUids = [];
    let listContinue:string = null;
    let newFetchStarted = false;
    setAnarchyGovernors(undefined);
    setSelectedAnarchyGovernorUids([]);
    while (true) {
      const anarchyGovernorList = await listAnarchyGovernors({
        continue: listContinue,
        limit: 20,
        namespace: anarchyNamespace,
      });
      const newAnarchyGovernors = (anarchyGovernorList.items || []).map(anarchyGovernor => {
        return {
          apiVersion: anarchyGovernor.apiVersion,
          kind: anarchyGovernor.kind,
          metadata: {
            creationTimestamp: anarchyGovernor.metadata.creationTimestamp,
            deletionTimestamp: anarchyGovernor.metadata.deletionTimestamp,
            name: anarchyGovernor.metadata.name,
            namespace: anarchyGovernor.metadata.namespace,
            uid: anarchyGovernor.metadata.uid,
          },
          spec: {
            governor: anarchyGovernor.spec.governor,
          },
        };
      });
      setAnarchyGovernors((value) => {
        const previousAnarchyGovernors = value || [];
        const previousUids = previousAnarchyGovernors.map(a => a.metadata.uid);
        if (fetchedUids.length == previousUids.length 
        && fetchedUids.every((uid, idx) => uid === previousUids[idx])) {
          fetchedUids.push(...newAnarchyGovernors.map(a => a.metadata.uid));
          return [...previousAnarchyGovernors, ...newAnarchyGovernors];
        } else {
          newFetchStarted = true;
          return previousAnarchyGovernors;
        }
      });
      if (newFetchStarted) {
        break;
      }
      listContinue = anarchyGovernorList.metadata.continue as string;
      if (!listContinue) {
        break;
      }
    }
  }

  useEffect(() => {
    fetchAnarchyGovernors();
  }, [anarchyNamespace]);

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Split hasGutter>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">AnarchyGovernors</Title>
        </SplitItem>
        <SplitItem>
          <Button
            icon={<RedoIcon/>}
            onClick={() => {
              setAnarchyGovernors(undefined);
              fetchAnarchyGovernors();
            }}
            variant="tertiary"
          >Refresh</Button>
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
    { anarchyGovernors === undefined ? (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    ) : anarchyGovernors.length === 0 ? (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No AnarchyGovernors found
          </Title>
        </EmptyState>
      </PageSection>
    ) : (
      <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
        <SelectableTable
          columns={['Namespace', 'Name', 'Created At']}
          onSelectAll={(isSelected) => {
            if (isSelected) {
              setSelectedAnarchyGovernorUids(anarchyGovernors.map(anarchyGovernor => anarchyGovernor.metadata.uid));
            } else {
              setSelectedAnarchyGovernorUids([]);
            }
          }}
          rows={anarchyGovernors.map((anarchyGovernor:AnarchyGovernor) => {
            return {
              cells: [
                <>
                  {anarchyGovernor.metadata.namespace}
                  <OpenshiftConsoleLink key="console" resource={anarchyGovernor} linkToNamespace={true}/>
                </>,
                <>
                  <Link key="admin" to={`${basePath}/${anarchyGovernor.metadata.namespace}/${anarchyGovernor.metadata.name}`}>{anarchyGovernor.metadata.name}</Link>
                  <OpenshiftConsoleLink key="console" resource={anarchyGovernor}/>
                </>,
                <>
                  <LocalTimestamp key="timestamp" timestamp={anarchyGovernor.metadata.creationTimestamp}/>
                  {' '}
                  (<TimeInterval key="interval" to={anarchyGovernor.metadata.creationTimestamp}/>)
                </>,
              ],
              onSelect: (isSelected) => setSelectedAnarchyGovernorUids(uids => {
                if (isSelected) {
                  if (selectedAnarchyGovernorUids.includes(anarchyGovernor.metadata.uid)) {
                    return selectedAnarchyGovernorUids;
                  } else {
                    return [...selectedAnarchyGovernorUids, anarchyGovernor.metadata.uid];
                  }
                } else {
                  return uids.filter(uid => uid !== anarchyGovernor.metadata.uid);
                }
              }),
              selected: selectedAnarchyGovernorUids.includes(anarchyGovernor.metadata.uid),
            };
          })}
        />
      </PageSection>
    )}
  </>);
}

export default AnarchyGovernors;
