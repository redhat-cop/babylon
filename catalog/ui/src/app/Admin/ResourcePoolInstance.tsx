import React, { useEffect, useReducer, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  EmptyState,
  Form,
  FormGroup,
  NumberInput,
  PageSection,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Tabs,
  Tab,
  TabTitleText,
  Title,
  Spinner,
  } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import {
  apiPaths,
  createResourcePoolScaling,
  deleteResourceHandle,
  deleteResourcePool,
  deleteResourcePoolScaling,
  fetcher,
  fetcherItemsInAllPages,
} from '@app/api';
import { selectedUidsReducer } from '@app/reducers';
import { ResourceHandle, ResourcePool, ResourcePoolList, ResourcePoolScaling } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import DateTimePicker from '@app/components/DateTimePicker';
import LocalTimestamp from '@app/components/LocalTimestamp';
import Modal, { useModal } from '@app/Modal/Modal';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ResourcePoolMinAvailableInput from './ResourcePoolMinAvailableInput';
import { useErrorHandler } from 'react-error-boundary';
import useSWR from 'swr';
import { BABYLON_DOMAIN, compareK8sObjects, compareK8sObjectsArr, FETCH_BATCH_LIMIT } from '@app/util';
import useMatchMutate from '@app/utils/useMatchMutate';
import getPoolStatus from './getPoolStatus';
import useSession from '@app/utils/useSession';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';

import './admin.css';

function fetchResourceHandlesFromResourcePool(resourcePoolName: string) {
  return fetcherItemsInAllPages((continueId) =>
    apiPaths.RESOURCE_HANDLES({
      labelSelector: `poolboy.gpte.redhat.com/resource-pool-name=${resourcePoolName}`,
      limit: FETCH_BATCH_LIMIT,
      continueId,
    }),
  );
}

const CreateResourcePoolScalingForm: React.FC<{
  resourcePool: ResourcePool;
  onCreated: (scaling: ResourcePoolScaling) => void;
  setOnConfirmCb?: React.Dispatch<React.SetStateAction<() => Promise<void>>>;
}> = ({ resourcePool, onCreated, setOnConfirmCb }) => {
  const [count, setCount] = useState(1);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!setOnConfirmCb) return;
    setOnConfirmCb(() => async () => {
      const definition: ResourcePoolScaling = {
        apiVersion: 'poolboy.gpte.redhat.com/v1',
        kind: 'ResourcePoolScaling',
        metadata: {
          generateName: `${resourcePool.metadata.name}-`,
          namespace: 'poolboy',
          name: '',
          labels: {
            'poolboy.gpte.redhat.com/resource-pool-name': resourcePool.metadata.name,
          },
          ownerReferences: [
            {
              apiVersion: 'poolboy.gpte.redhat.com/v1',
              controller: true,
              kind: 'ResourcePool',
              name: resourcePool.metadata.name,
              uid: resourcePool.metadata.uid,
            },
          ],
        },
        spec: {
          count,
          resourcePool: {
            name: resourcePool.metadata.name,
          },
        },
      };
      if (scheduledDate) {
        definition.spec.at = scheduledDate.toISOString();
      }
      const created = await createResourcePoolScaling(definition);
      onCreated(created);
    });
  }, [count, onCreated, resourcePool, scheduledDate, setOnConfirmCb]);

  return (
    <Form>
      <FormGroup label="Number of ResourceHandles to add" isRequired fieldId="scaling-count">
        <NumberInput
          id="scaling-count"
          value={count}
          min={1}
          onMinus={() => setCount(Math.max(1, count - 1))}
          onPlus={() => setCount(count + 1)}
          onChange={(event: React.FormEvent<HTMLInputElement>) => {
            const val = parseInt((event.target as HTMLInputElement).value, 10);
            if (!isNaN(val) && val >= 1) setCount(val);
          }}
        />
      </FormGroup>
      <FormGroup label="Scheduled time (optional)" fieldId="scaling-time">
        <DateTimePicker
          defaultTimestamp={now}
          onSelect={(date) => setScheduledDate(date)}
          minDate={now}
        />
      </FormGroup>
    </Form>
  );
};

const ResourcePoolInstanceComponent: React.FC<{ resourcePoolName: string; activeTab: string }> = ({
  resourcePoolName,
  activeTab,
}) => {
  const navigate = useNavigate();
  const { consoleUrl } = useSession().getSession();
  const matchMutate = useMatchMutate();
  const [selectedResourceHandleUids, reduceResourceHandleSelectedUids] = useReducer(selectedUidsReducer, []);
  const [selectedScalingUids, reduceScalingSelectedUids] = useReducer(selectedUidsReducer, []);
  const [createScalingModal, openCreateScalingModal] = useModal();
  const [deleteScalingModal, openDeleteScalingModal] = useModal();
  const [scalingToDelete, setScalingToDelete] = useState<ResourcePoolScaling | null>(null);

  const {
    data: resourcePool,
    error,
    mutate,
  } = useSWR<ResourcePool>(
    apiPaths.RESOURCE_POOL({
      resourcePoolName,
    }),
    fetcher,
    {
      refreshInterval: 8000,
      compare: compareK8sObjects,
    },
  );
  useErrorHandler(error?.status === 404 ? error : null);

  const { data: resourceHandles, mutate: mutateResourceHandles } = useSWR<ResourceHandle[]>(
    resourcePool
      ? apiPaths.RESOURCE_HANDLES({
          labelSelector: `poolboy.gpte.redhat.com/resource-pool-name=${resourcePoolName}`,
          limit: FETCH_BATCH_LIMIT,
        })
      : null,
    () => fetchResourceHandlesFromResourcePool(resourcePoolName),
  );

  const { data: resourcePoolScalings, mutate: mutateScalings } = useSWR<ResourcePoolScaling[]>(
    resourcePool
      ? apiPaths.RESOURCE_POOL_SCALINGS({
          labelSelector: `poolboy.gpte.redhat.com/resource-pool-name=${resourcePoolName}`,
          limit: FETCH_BATCH_LIMIT,
        })
      : null,
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.RESOURCE_POOL_SCALINGS({
          labelSelector: `poolboy.gpte.redhat.com/resource-pool-name=${resourcePoolName}`,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        }),
      ),
    {
      refreshInterval: 8000,
      compare: compareK8sObjectsArr,
    },
  );

  const { total, taken, available } = getPoolStatus(resourceHandles);

  function mutateResourcePoolsList(data: ResourcePoolList) {
    matchMutate([{ name: 'RESOURCE_POOLS', arguments: { limit: FETCH_BATCH_LIMIT }, data }]);
  }

  async function confirmThenDelete(): Promise<void> {
    if (confirm(`Delete ResourcePool ${resourcePoolName}?`)) {
      await deleteResourcePool(resourcePool);
      mutate();
      mutateResourceHandles();
      mutateResourcePoolsList(undefined);
      navigate('/admin/resourcepools');
    }
  }

  async function confirmThenDeleteSelectedScalings(): Promise<void> {
    if (confirm('Delete selected ResourcePoolScalings?')) {
      const remaining: ResourcePoolScaling[] = [];
      for (const scaling of resourcePoolScalings || []) {
        if (selectedScalingUids.includes(scaling.metadata.uid)) {
          await deleteResourcePoolScaling(scaling);
        } else {
          remaining.push(scaling);
        }
      }
      reduceScalingSelectedUids({ type: 'clear' });
      mutateScalings(remaining);
    }
  }

  async function confirmThenDeleteSelectedHandles(): Promise<void> {
    if (confirm('Delete selected ResourceHandles?')) {
      const updatedResourceHandles: ResourceHandle[] = [];
      for (const resourceHandle of resourceHandles) {
        if (selectedResourceHandleUids.includes(resourceHandle.metadata.uid)) {
          await deleteResourceHandle(resourceHandle);
        } else {
          updatedResourceHandles.push(resourceHandle);
        }
      }
      mutateResourceHandles(updatedResourceHandles);
    }
  }

  return (
    <>
      <Modal
        ref={createScalingModal}
        title="Add Capacity to ResourcePool"
        onConfirm={() => {}}
        passModifiers
        confirmText="Create"
      >
        <CreateResourcePoolScalingForm
          resourcePool={resourcePool}
          onCreated={(created) => {
            mutateScalings((prev) => [...(prev || []), created], false);
          }}
        />
      </Modal>
      <Modal
        ref={deleteScalingModal}
        title={`Delete ResourcePoolScaling ${scalingToDelete?.metadata.name}?`}
        onConfirm={async () => {
          if (!scalingToDelete) return;
          await deleteResourcePoolScaling(scalingToDelete);
          mutateScalings(
            (prev) => (prev || []).filter((s) => s.metadata.uid !== scalingToDelete.metadata.uid),
            false,
          );
          setScalingToDelete(null);
        }}
        confirmText="Delete"
      >
        <p>This will remove the scaling request from the ResourcePool.</p>
      </Modal>
      <PageSection hasBodyWrapper={false} key="header" className="admin-header" >
        <Breadcrumb>
          <BreadcrumbItem
            render={({ className }) => (
              <Link to="/admin/resourcepools" className={className}>
                ResourcePools
              </Link>
            )}
          />
          <BreadcrumbItem>{resourcePoolName}</BreadcrumbItem>
        </Breadcrumb>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              ResourcePool {resourcePoolName}
            </Title>
          </SplitItem>
          <SplitItem>
            <ActionDropdown
              position="right"
              actionDropdownItems={[
                <ActionDropdownItem key="delete" label="Delete ResourcePool" onSelect={confirmThenDelete} />,
                <ActionDropdownItem
                  key="addCapacity"
                  label="Add Capacity (ResourcePoolScaling)"
                  onSelect={openCreateScalingModal}
                />,
                <ActionDropdownItem
                  key="deletedSelectedHandles"
                  isDisabled={selectedResourceHandleUids.length === 0}
                  label="Delete Selected ResourceHandles"
                  onSelect={confirmThenDeleteSelectedHandles}
                />,
                <ActionDropdownItem
                  key="deleteSelectedScalings"
                  isDisabled={selectedScalingUids.length === 0}
                  label="Delete Selected ResourcePoolScalings"
                  onSelect={confirmThenDeleteSelectedScalings}
                />,
                <ActionDropdownItem
                  key="editInOpenShift"
                  label="Edit in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${resourcePool.metadata.namespace}/${resourcePool.apiVersion.replace(
                        '/',
                        '~',
                      )}~${resourcePool.kind}/${resourcePool.metadata.name}/yaml`,
                    )
                  }
                />,
                <ActionDropdownItem
                  key="openInOpenShift"
                  label="Open in OpenShift Console"
                  onSelect={() =>
                    window.open(
                      `${consoleUrl}/k8s/ns/${resourcePool.metadata.namespace}/${resourcePool.apiVersion.replace(
                        '/',
                        '~',
                      )}~${resourcePool.kind}/${resourcePool.metadata.name}`,
                    )
                  }
                />,
              ]}
            />
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection hasBodyWrapper={false} key="body"  className="admin-body">
        <Tabs
          activeKey={activeTab}
          onSelect={(e, tabIndex) => navigate(`/admin/resourcepools/${resourcePoolName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <Stack hasGutter>
              <StackItem>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourcePoolName}
                      <OpenshiftConsoleLink resource={resourcePool} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Description</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourcePool.metadata.annotations?.[`${BABYLON_DOMAIN}/description`] || <p>-</p>}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Created At</DescriptionListTerm>
                    <DescriptionListDescription>
                      <LocalTimestamp timestamp={resourcePool.metadata.creationTimestamp} />
                      <span style={{ padding: '0 6px' }}>
                        (<TimeInterval toTimestamp={resourcePool.metadata.creationTimestamp} />)
                      </span>
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Unclaimed Lifespan</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourcePool.spec.lifespan?.unclaimed || <p>-</p>}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Minimum Available</DescriptionListTerm>
                    <DescriptionListDescription>
                      <ResourcePoolMinAvailableInput
                        resourcePoolName={resourcePoolName}
                        minAvailable={resourcePool.spec.minAvailable}
                        mutateFn={(updatedResourcePool: ResourcePool) => {
                          mutate(updatedResourcePool);
                          mutateResourceHandles(fetchResourceHandlesFromResourcePool(resourcePoolName));
                          mutateResourcePoolsList(undefined);
                        }}
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Total</DescriptionListTerm>
                    <DescriptionListDescription>{total}</DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Available</DescriptionListTerm>
                    <DescriptionListDescription>
                      {available === -1 ? <Spinner key="spinner" size="md" /> : available}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Taken</DescriptionListTerm>
                    <DescriptionListDescription>{taken}</DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </StackItem>
              {resourcePool.spec.resources.map((resourcePoolSpecResource, idx) => {
                const resourceName = resourcePoolSpecResource.name || resourcePoolSpecResource.provider.name;
                return (
                  <StackItem key={idx}>
                    <Title headingLevel="h3">
                      {resourceName === 'babylon'
                        ? 'Babylon Legacy CloudForms Integration'
                        : `Resource: ${resourceName}`}
                    </Title>
                    <DescriptionList isHorizontal>
                      <DescriptionListGroup>
                        <DescriptionListTerm>ResourceProvider</DescriptionListTerm>
                        <DescriptionListDescription>
                          <Link to={`/admin/resourceproviders/${resourcePoolSpecResource.provider.name}`}>
                            {resourcePoolSpecResource.provider.name}
                          </Link>
                          <OpenshiftConsoleLink reference={resourcePoolSpecResource.provider} />
                        </DescriptionListDescription>
                      </DescriptionListGroup>

                      {resourcePoolSpecResource.template?.spec?.vars?.job_vars ? (
                        <DescriptionListGroup>
                          <DescriptionListTerm>Job Vars</DescriptionListTerm>
                          <DescriptionListDescription style={{ whiteSpace: 'pre-wrap' }}>
                            {yaml.dump(resourcePoolSpecResource.template.spec.vars.job_vars)}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      ) : null}
                    </DescriptionList>
                  </StackItem>
                );
              })}
            </Stack>
          </Tab>
          <Tab eventKey="resourcehandles" title={<TabTitleText>ResourceHandles</TabTitleText>}>
            {resourceHandles.length === 0 ? (
              <EmptyState  headingLevel="h1" icon={ExclamationTriangleIcon}  titleText="No ResourceHandles found." variant="full">
                </EmptyState>
            ) : (
              <SelectableTable
                columns={['Name', 'Service Namespace', 'ResourceClaim', 'Created At']}
                onSelectAll={(isSelected: boolean) => {
                  if (isSelected) {
                    reduceResourceHandleSelectedUids({
                      type: 'set',
                      uids: resourceHandles.map((item) => item.metadata.uid),
                    });
                  } else {
                    reduceResourceHandleSelectedUids({
                      type: 'clear',
                    });
                  }
                }}
                rows={resourceHandles.map((resourceHandle: ResourceHandle) => {
                  return {
                    cells: [
                      <>
                        <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.metadata.name}`}>
                          {resourceHandle.metadata.name}
                        </Link>
                        <OpenshiftConsoleLink key="console" resource={resourceHandle} />
                      </>,
                      <>
                        {resourceHandle.spec.resourceClaim ? (
                          [
                            <Link key="admin" to={`/services/${resourceHandle.spec.resourceClaim.namespace}`}>
                              {resourceHandle.spec.resourceClaim.namespace}
                            </Link>,
                            <OpenshiftConsoleLink
                              key="console"
                              reference={resourceHandle.spec.resourceClaim}
                              linkToNamespace={true}
                            />,
                          ]
                        ) : (
                          <p>-</p>
                        )}
                      </>,
                      <>
                        {resourceHandle.spec.resourceClaim ? (
                          [
                            <Link
                              key="admin"
                              to={`/services/${resourceHandle.spec.resourceClaim.namespace}/${resourceHandle.spec.resourceClaim.name}`}
                            >
                              {resourceHandle.spec.resourceClaim.name}
                            </Link>,
                            <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourceClaim} />,
                          ]
                        ) : (
                          <p>-</p>
                        )}
                      </>,
                      <>
                        <LocalTimestamp key="timestamp" timestamp={resourceHandle.metadata.creationTimestamp} />
                        <span key="interval" style={{ padding: '0 6px' }}>
                          (<TimeInterval key="time-interval" toTimestamp={resourceHandle.metadata.creationTimestamp} />)
                        </span>
                      </>,
                    ],
                    onSelect: (isSelected: boolean) =>
                      reduceResourceHandleSelectedUids({
                        type: isSelected ? 'add' : 'remove',
                        uids: [resourceHandle.metadata.uid],
                      }),
                    selected: selectedResourceHandleUids.includes(resourceHandle.metadata.uid),
                  };
                })}
              />
            )}
          </Tab>
          <Tab eventKey="scaling" title={<TabTitleText>Scaling</TabTitleText>}>
            <Stack hasGutter>
              <StackItem>
                <Split hasGutter>
                  <SplitItem isFilled />
                  <SplitItem>
                    <Button variant="primary" onClick={openCreateScalingModal}>
                      Add Capacity
                    </Button>
                  </SplitItem>
                </Split>
              </StackItem>
              <StackItem>
                {!resourcePoolScalings || resourcePoolScalings.length === 0 ? (
                  <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No ResourcePoolScalings found." variant="full" />
                ) : (
                  <SelectableTable
                    columns={['Name', 'Requested Count', 'Current Count', 'Scheduled At', 'Created At', '']}
                    onSelectAll={(isSelected: boolean) => {
                      if (isSelected) {
                        reduceScalingSelectedUids({
                          type: 'set',
                          uids: resourcePoolScalings.map((item) => item.metadata.uid),
                        });
                      } else {
                        reduceScalingSelectedUids({ type: 'clear' });
                      }
                    }}
                    rows={resourcePoolScalings.map((scaling: ResourcePoolScaling) => ({
                      cells: [
                        <>
                          {scaling.metadata.name}
                          <OpenshiftConsoleLink key="console" resource={scaling} />
                        </>,
                        <>{scaling.spec.count}</>,
                        <>{scaling.status?.count ?? '-'}</>,
                        <>
                          {scaling.spec.at ? (
                            <>
                              <LocalTimestamp key="timestamp" timestamp={scaling.spec.at} />
                              <span key="interval" style={{ padding: '0 6px' }}>
                                (<TimeInterval key="time-interval" toTimestamp={scaling.spec.at} />)
                              </span>
                            </>
                          ) : (
                            'Immediate'
                          )}
                        </>,
                        <>
                          <LocalTimestamp key="timestamp" timestamp={scaling.metadata.creationTimestamp} />
                          <span key="interval" style={{ padding: '0 6px' }}>
                            (<TimeInterval key="time-interval" toTimestamp={scaling.metadata.creationTimestamp} />)
                          </span>
                        </>,
                        <div key="actions">
                          <ButtonCircleIcon
                            onClick={() => {
                              setScalingToDelete(scaling);
                              openDeleteScalingModal();
                            }}
                            description="Delete"
                            icon={TrashIcon}
                          />
                        </div>,
                      ],
                      onSelect: (isSelected: boolean) =>
                        reduceScalingSelectedUids({
                          type: isSelected ? 'add' : 'remove',
                          uids: [scaling.metadata.uid],
                        }),
                      selected: selectedScalingUids.includes(scaling.metadata.uid),
                    }))}
                  />
                )}
              </StackItem>
            </Stack>
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <Editor
              height="500px"
              language="yaml"
              options={{ readOnly: true }}
              theme="vs-dark"
              value={yaml.dump(resourcePool)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const ResourcePoolInstance: React.FC = () => {
  const { name: resourcePoolName, tab: activeTab = 'details' } = useParams();
  return (
    <ErrorBoundaryPage name={resourcePoolName} type="ResourcePool">
      <ResourcePoolInstanceComponent activeTab={activeTab} resourcePoolName={resourcePoolName} />
    </ErrorBoundaryPage>
  );
};

export default ResourcePoolInstance;
