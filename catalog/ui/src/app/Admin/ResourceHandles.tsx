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
  ResourceHandle,
  deleteResourceHandle,
  listResourceHandles,
} from '@app/api';
import { RedoIcon } from '@patternfly/react-icons';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { SelectableTable } from '@app/components/SelectableTable';
import { TimeInterval } from '@app/components/TimeInterval';
import { OpenshiftConsoleLink } from './OpenshiftConsoleLink';

import './admin.css';

export interface ResourceHandlesProps {
  location?: any;
}

const ResourceHandles: React.FunctionComponent<ResourceHandlesProps> = ({
  location,
}) => {
  const history = useHistory();
  const urlParams = new URLSearchParams(location.search);

  const [resourceHandles, setResourceHandles] = useState(undefined);
  const [selectedResourceHandleUids, setSelectedResourceHandleUids] = React.useState([]);

  async function confirmThenDelete() {
    if (confirm("Deleted selected ResourceHandles?")) {
      const resourceHandlesToDelete = resourceHandles.filter(resourceHandle => selectedResourceHandleUids.includes(resourceHandle.metadata.uid));
      setResourceHandles(undefined);
      for (const resourceHandle of resourceHandlesToDelete) {
        if (selectedResourceHandleUids.includes(resourceHandle.metadata.uid)) {
          await deleteResourceHandle(resourceHandle);
        }
      }
      await fetchResourceHandles();
    }
  }

  async function fetchResourceHandles() {
    const fetchedUids = [];
    let listContinue:string = null;
    let newFetchStarted = false;
    setResourceHandles(undefined);
    setSelectedResourceHandleUids([]);
    while (true) {
      const resourceHandleList = await listResourceHandles({
        continue: listContinue,
        limit: 20,
      });
      const newResourceHandles = (resourceHandleList.items || []).map(resourceHandle => {
        return {
          apiVersion: resourceHandle.apiVersion,
          kind: resourceHandle.kind,
          metadata: {
            creationTimestamp: resourceHandle.metadata.creationTimestamp,
            name: resourceHandle.metadata.name,
            namespace: resourceHandle.metadata.namespace,
            uid: resourceHandle.metadata.uid,
          },
          spec: {
            lifespan: resourceHandle.spec.lifespan,
            resourceClaim: resourceHandle.spec.resourceClaim,
            resourcePool: resourceHandle.spec.resourcePool,
            resources: [
              ...resourceHandle.spec.resources.map((resource) => {
                return {
                  name: resource.name,
                  provider: resource.provider,
                  reference: resource.reference,
                };
              })
            ]
          },
        };
      });
      setResourceHandles((value) => {
        const previousResourceHandles = value || [];
        const previousUids = previousResourceHandles.map(a => a.metadata.uid);
        if (fetchedUids.length == previousUids.length 
        && fetchedUids.every((uid, idx) => uid === previousUids[idx])) {
          fetchedUids.push(...newResourceHandles.map(a => a.metadata.uid));
          return [...previousResourceHandles, ...newResourceHandles];
        } else {
          newFetchStarted = true;
          return previousResourceHandles;
        }
      });
      if (newFetchStarted) {
        break;
      }
      listContinue = resourceHandleList.metadata.continue as string;
      if (!listContinue) {
        break;
      }
    }
  }

  useEffect(() => {
    fetchResourceHandles();
  }, []);

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Split hasGutter>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">ResourceHandles</Title>
        </SplitItem>
        <SplitItem>
          <Button
            icon={<RedoIcon/>}
            onClick={() => {
              setResourceHandles(undefined);
              fetchResourceHandles();
            }}
            variant="tertiary"
          >Refresh</Button>
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
    { resourceHandles === undefined ? (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    ) : resourceHandles.length === 0 ? (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No ResourceHandles found
          </Title>
        </EmptyState>
      </PageSection>
    ) : (
      <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
        <SelectableTable
          columns={['Name', 'ResourcePool', 'Service Namespace', 'ResourceClaim', 'ResourceProvider(s)', 'Created At']}
          onSelectAll={(isSelected) => {
            if (isSelected) {
              setSelectedResourceHandleUids(resourceHandles.map(resourceHandle => resourceHandle.metadata.uid));
            } else {
              setSelectedResourceHandleUids([]);
            }
          }}
          rows={resourceHandles.map((resourceHandle:ResourceHandle) => {
            return {
              cells: [
                <>
                  <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.metadata.name}`}>{resourceHandle.metadata.name}</Link>
                  <OpenshiftConsoleLink key="console" resource={resourceHandle}/>
                </>,
                resourceHandle.spec.resourcePool ? (
                  <>
                    <Link key="admin" to={`/admin/resourcepools/${resourceHandle.spec.resourcePool.name}`}>{resourceHandle.spec.resourcePool.name}</Link>
                    <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourcePool}/>
                  </>
                ) : '-',
                resourceHandle.spec.resourceClaim ? (
                  <>
                    <Link key="admin" to={`/services/ns/${resourceHandle.spec.resourceClaim.namespace}`}>{resourceHandle.spec.resourceClaim.namespace}</Link>
                    <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourceClaim} linkToNamespace={true}/>
                  </>
                ) : '-',
                resourceHandle.spec.resourceClaim ? (
                  <>
                    <Link key="admin" to={`/services/ns/${resourceHandle.spec.resourceClaim.namespace}/item/${resourceHandle.spec.resourceClaim.name}`}>{resourceHandle.spec.resourceClaim.name}</Link>
                    <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourceClaim}/>
                  </>
                ) : '-',
                <>
                  { resourceHandle.spec.resources.map((resourceHandleSpecResource, idx) =>
                    <div key={idx}>
                      <Link key="admin" to={`/admin/resourceproviders/${resourceHandleSpecResource.provider.name}`}>{resourceHandleSpecResource.provider.name}</Link>
                      <OpenshiftConsoleLink key="console" reference={resourceHandleSpecResource.provider}/>
                    </div>
                  )}
                </>,
                <>
                  <LocalTimestamp key="timestamp" timestamp={resourceHandle.metadata.creationTimestamp}/>
                  {' '}
                  (<TimeInterval key="interval" to={resourceHandle.metadata.creationTimestamp}/>)
                </>,
              ],
              onSelect: (isSelected) => setSelectedResourceHandleUids(uids => {
                if (isSelected) {
                  if (selectedResourceHandleUids.includes(resourceHandle.metadata.uid)) {
                    return selectedResourceHandleUids;
                  } else {
                    return [...selectedResourceHandleUids, resourceHandle.metadata.uid];
                  }
                } else {
                  return uids.filter(uid => uid !== resourceHandle.metadata.uid);
                }
              }),
              selected: selectedResourceHandleUids.includes(resourceHandle.metadata.uid),
            };
          })}
        />
      </PageSection>
    )}
  </>);
}

export default ResourceHandles;
