import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, Link, useParams } from 'react-router-dom';
import { EditorState, LexicalEditor } from 'lexical';
import { $generateHtmlFromNodes } from '@lexical/html';
import MonacoEditor from '@monaco-editor/react';
import * as yaml from 'js-yaml';
import useSWR, { useSWRConfig } from 'swr';
import {
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  Button,
  CodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  NumberInput,
  PageSection,
  Split,
  SplitItem,
  Spinner,
  Switch,
  Tabs,
  Tab,
  TabTitleText,
  Title,
  Tooltip,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';
import { Select, SelectOption, SelectList } from '@patternfly/react-core';

import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import {
  apiPaths,
  dateToApiString,
  deleteSelfPacedLab,
  deleteResourceClaim,
  fetcher,
  fetcherItemsInAllPages,
  patchResourceClaim,
  patchSelfPacedLab,
  patchSelfPacedLabProvisionItem,
  SERVICES_KEY,
} from '@app/api';
import { CatalogItem, ResourceClaim, SelfPacedLab, SelfPacedLabProvisionItem as SelfPacedLabProvisionItemType, SelfPacedLabUserAssignmentList } from '@app/types';
import {
  BABYLON_DOMAIN,
  DEMO_DOMAIN,
  compareK8sObjects,
  compareK8sObjectsArr,
  displayName,
  FETCH_BATCH_LIMIT,
  getStageFromK8sObject,
  setSalesforceItems as setSalesforceItemsAnno,
} from '@app/util';
import useSession from '@app/utils/useSession';
import useDebounce from '@app/utils/useDebounce';
import useDebounceState from '@app/utils/useDebounceState';
import Modal, { useModal } from '@app/Modal/Modal';
import Label from '@app/components/Label';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import ProjectSelector from '@app/components/ProjectSelector';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import SelectableTable from '@app/components/SelectableTable';
import ServiceStatus from '@app/Services/ServiceStatus';
import TimeInterval from '@app/components/TimeInterval';
import ServiceActions from '@app/Services/ServiceActions';
import EditableText from '@app/components/EditableText';
import Editor from '@app/components/Editor/Editor';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import LoadingIcon from '@app/components/LoadingIcon';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import PatientNumberInput from '@app/components/PatientNumberInput';
import ResourceClaimDeleteModal from '@app/components/ResourceClaimDeleteModal';
import SelfPacedLabStatus from '@app/components/SelfPacedLabStatus';
import ResourcePoolSelector from '@app/components/ResourcePoolSelector';
import SalesforceItemsList from '@app/components/SalesforceItemsList';
import SalesforceItemsEditModal from '@app/components/SalesforceItemsEditModal';
import PlusCircleIcon from '@patternfly/react-icons/dist/js/icons/plus-circle-icon';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';
import SelfPacedLabScheduleAction from './SelfPacedLabScheduleAction';
import useSWRImmutable from 'swr/immutable';

import './selfpacedlab-item.css';

type ModalAction = 'scheduleDelete' | 'scheduleStart';

const SelfPacedLabItemComponent: React.FC<{
  activeTab: string;
  serviceNamespaceName: string;
  selfPacedLabName: string;
}> = ({ activeTab, serviceNamespaceName, selfPacedLabName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { cache } = useSWRConfig();
  const { isAdmin, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const { sfdc_enabled } = useInterfaceConfig();
  const [modalDelete, openModalDelete] = useModal();
  const [modalSchedule, openModalSchedule] = useModal();
  const [scheduleAction, setScheduleAction] = useState<ModalAction>('scheduleDelete');
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState(false);
  const [modalEditSalesforce, setModalEditSalesforce] = useState(false);
  const [modalDeleteRC, openModalDeleteRC] = useModal();
  const [deleteTargetRCs, setDeleteTargetRCs] = useState<ResourceClaim[]>([]);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);

  const { data: selfPacedLab, mutate: mutateSelfPacedLab } = useSWR<SelfPacedLab>(
    apiPaths.SELF_PACED_LAB({ namespace: serviceNamespaceName, selfPacedLabName }),
    fetcher,
    {
      refreshInterval: 8000,
      compare: compareK8sObjects,
      revalidateOnMount: true,
    },
  );

  const stage = getStageFromK8sObject(selfPacedLab);

  const { data: catalogItem } = useSWRImmutable<CatalogItem>(
    selfPacedLab?.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`]
      ? apiPaths.CATALOG_ITEM({
          namespace: selfPacedLab.metadata.labels[`${BABYLON_DOMAIN}/catalogItemNamespace`],
          name: selfPacedLab.metadata.labels[`${BABYLON_DOMAIN}/catalogItemName`],
        })
      : null,
    fetcher,
  );

  const { data: selfPacedLabProvisionItems, mutate: mutateSelfPacedLabProvisionItems } = useSWR<SelfPacedLabProvisionItemType[]>(
    selfPacedLab
      ? apiPaths.SELF_PACED_LAB_PROVISION_ITEMS({
          namespace: serviceNamespaceName,
          selfPacedLabName: selfPacedLab.metadata.name,
        })
      : null,
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.SELF_PACED_LAB_PROVISION_ITEMS({
          namespace: serviceNamespaceName,
          selfPacedLabName: selfPacedLab.metadata.name,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        }),
      ),
    {
      refreshInterval: 8000,
      compare: compareK8sObjectsArr,
    },
  );

  const { data: resourceClaims, mutate: mutateRC } = useSWR<ResourceClaim[]>(
    selfPacedLab
      ? apiPaths.RESOURCE_CLAIMS({
          namespace: serviceNamespaceName,
          labelSelector: `${BABYLON_DOMAIN}/selfpacedlab=${selfPacedLab.metadata.name}`,
          limit: 'ALL',
        })
      : null,
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.RESOURCE_CLAIMS({
          namespace: serviceNamespaceName,
          labelSelector: `${BABYLON_DOMAIN}/selfpacedlab=${selfPacedLab.metadata.name}`,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        }),
      ),
    {
      refreshInterval: 8000,
      compare: compareK8sObjectsArr,
    },
  );

  const { data: userAssignmentsList } = useSWR<SelfPacedLabUserAssignmentList>(
    selfPacedLab
      ? apiPaths.SELF_PACED_LAB_USER_ASSIGNMENTS({
          namespace: serviceNamespaceName,
          selfPacedLabName: selfPacedLab.metadata.name,
        })
      : null,
    fetcher,
    {
      refreshInterval: 8000,
    },
  );

  const selfPacedLabId = selfPacedLab?.metadata.labels?.[`${BABYLON_DOMAIN}/selfpacedlab-id`];
  const activeResourceClaims = useMemo(
    () => (resourceClaims || []).filter((rc) => !rc.metadata.deletionTimestamp),
    [resourceClaims],
  );
  const userRegistrationValue = selfPacedLab?.spec.openRegistration === false ? 'pre' : 'open';
  const autoDestroyTime = selfPacedLab?.spec.lifespan?.end ? Date.parse(selfPacedLab.spec.lifespan.end) : null;
  const autoStartTime = selfPacedLab?.spec.lifespan?.start ? Date.parse(selfPacedLab.spec.lifespan.start) : null;

  const selectedResourceClaims = useMemo(
    () => activeResourceClaims.filter((rc) => selectedUids.includes(rc.metadata.uid)),
    [activeResourceClaims, selectedUids],
  );

  async function onInstanceDeleteConfirm() {
    for (const rc of deleteTargetRCs) {
      await deleteResourceClaim(rc);
    }
    setSelectedUids([]);
    mutateRC();
  }

  // Admin settings
  const opsEffortAnnotation = selfPacedLab?.metadata.annotations?.[`${DEMO_DOMAIN}/ops-effort`];
  const opsEffortFromAnnotation = useMemo(() => parseInt(opsEffortAnnotation || '0', 10) || 0, [opsEffortAnnotation]);
  const [opsEffort, setOpsEffort] = useState<number>(opsEffortFromAnnotation);
  const debouncedOpsEffort = useDebounceState(opsEffort, 1000);

  useEffect(() => {
    setOpsEffort(opsEffortFromAnnotation);
  }, [opsEffortFromAnnotation]);

  useEffect(() => {
    if (!selfPacedLab || debouncedOpsEffort === opsEffortFromAnnotation) return;
    const opsEffortValue = typeof debouncedOpsEffort === 'number' ? debouncedOpsEffort : Number(debouncedOpsEffort) || 0;
    patchSelfPacedLab({
      name: selfPacedLab.metadata.name,
      namespace: selfPacedLab.metadata.namespace,
      patch: {
        metadata: {
          annotations: {
            [`${DEMO_DOMAIN}/ops-effort`]: String(opsEffortValue),
          },
        },
      },
    }).then((updated) => mutateSelfPacedLab(updated));
  }, [debouncedOpsEffort, opsEffortFromAnnotation, selfPacedLab?.metadata?.name, selfPacedLab?.metadata?.namespace]);

  const whiteGloved = selfPacedLab?.metadata?.labels?.[`${DEMO_DOMAIN}/white-glove`] === 'true';
  const isLocked = selfPacedLab?.metadata?.labels?.[`${DEMO_DOMAIN}/lock-enabled`] === 'true';
  const resourcePoolAnnotation = selfPacedLab?.metadata?.annotations?.['poolboy.gpte.redhat.com/resource-pool-name'];
  const selectedResourcePool = resourcePoolAnnotation;

  async function handleWhiteGloveChange(_: unknown, isChecked: boolean) {
    if (!selfPacedLab) return;
    mutateSelfPacedLab(
      await patchSelfPacedLab({
        name: selfPacedLab.metadata.name,
        namespace: selfPacedLab.metadata.namespace,
        patch: {
          metadata: {
            labels: {
              [`${DEMO_DOMAIN}/white-glove`]: String(isChecked),
            },
          },
        },
      }),
    );
  }

  async function handleLockedChange(_: unknown, isChecked: boolean) {
    if (!selfPacedLab) return;
    mutateSelfPacedLab(
      await patchSelfPacedLab({
        name: selfPacedLab.metadata.name,
        namespace: selfPacedLab.metadata.namespace,
        patch: {
          metadata: {
            labels: {
              [`${DEMO_DOMAIN}/lock-enabled`]: String(isChecked),
            },
          },
        },
      }),
    );
  }

  async function handleResourcePoolChange(poolName: string | undefined) {
    if (!selfPacedLab) return;
    mutateSelfPacedLab(
      await patchSelfPacedLab({
        name: selfPacedLab.metadata.name,
        namespace: selfPacedLab.metadata.namespace,
        patch: {
          metadata: {
            annotations: {
              'poolboy.gpte.redhat.com/resource-pool-name': poolName || null,
            },
          },
        },
      }),
    );
  }

  const debouncedPatchSelfPacedLab = useDebounce(patchSelfPacedLab, 1000) as (...args: unknown[]) => Promise<SelfPacedLab>;

  const patchSelfPacedLabSpec = useCallback(
    async (patch: {
      accessPassword?: string;
      description?: string;
      displayName?: string;
      openRegistration?: boolean;
    }): Promise<void> => {
      if (!selfPacedLab) return;
      if (patch.openRegistration !== undefined && selfPacedLab.spec.openRegistration !== patch.openRegistration) {
        mutateSelfPacedLab(
          await patchSelfPacedLab({
            name: selfPacedLab.metadata.name,
            namespace: selfPacedLab.metadata.namespace,
            patch: { spec: patch },
          }),
        );
      } else {
        mutateSelfPacedLab(
          await debouncedPatchSelfPacedLab({
            name: selfPacedLab.metadata.name,
            namespace: selfPacedLab.metadata.namespace,
            patch: { spec: patch },
          }),
        );
      }
    },
    [selfPacedLab, mutateSelfPacedLab, debouncedPatchSelfPacedLab],
  );

  async function onDeleteConfirm() {
    await deleteSelfPacedLab(selfPacedLab);
    cache.delete(SERVICES_KEY({ namespace: selfPacedLab.metadata.namespace }));
    cache.delete(apiPaths.SELF_PACED_LAB({ namespace: serviceNamespaceName, selfPacedLabName }));
    navigate(`/services/${serviceNamespaceName}`);
  }

  async function onModalScheduleConfirm(date: Date) {
    if (!selfPacedLab) return;
    if (scheduleAction === 'scheduleDelete') {
      mutateSelfPacedLab(
        await patchSelfPacedLab({
          name: selfPacedLab.metadata.name,
          namespace: selfPacedLab.metadata.namespace,
          patch: { spec: { lifespan: { end: dateToApiString(date) } } },
        }),
      );
    } else if (scheduleAction === 'scheduleStart') {
      mutateSelfPacedLab(
        await patchSelfPacedLab({
          name: selfPacedLab.metadata.name,
          namespace: selfPacedLab.metadata.namespace,
          patch: { spec: { lifespan: { start: dateToApiString(date) } } },
        }),
      );
    }
  }

  const onToggleClick = () => {
    setUserRegistrationSelectIsOpen(!userRegistrationSelectIsOpen);
  };

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={userRegistrationSelectIsOpen}>
      {userRegistrationValue}
    </MenuToggle>
  );

  return (
    <>
      <Modal
        ref={modalDelete}
        onConfirm={onDeleteConfirm}
        title={`Delete self-paced lab ${displayName(selfPacedLab)}?`}
      >
        <p>All pool instances will be deleted.</p>
      </Modal>
      <Modal ref={modalSchedule} onConfirm={onModalScheduleConfirm} passModifiers={true} title={displayName(selfPacedLab)}>
        <SelfPacedLabScheduleAction
          action={scheduleAction === 'scheduleDelete' ? 'retirement' : 'start'}
          currentDate={scheduleAction === 'scheduleDelete' ? autoDestroyTime : autoStartTime}
        />
      </Modal>
      {selfPacedLabProvisionItems && selfPacedLabProvisionItems.length > 0 && (
        <SalesforceItemsEditModal
          isOpen={modalEditSalesforce}
          onClose={() => setModalEditSalesforce(false)}
          items={JSON.parse(selfPacedLabProvisionItems[0].spec.parameters?.['salesforce_items'] || '[]')}
          onSave={async (next) => {
            await patchSelfPacedLab({
              name: selfPacedLab.metadata.name,
              namespace: selfPacedLab.metadata.namespace,
              patch: {
                metadata: {
                  annotations: {
                    ...selfPacedLab.metadata.annotations,
                    'demo.redhat.com/salesforce-items': JSON.stringify(next),
                  },
                },
              },
            });
            for (const item of selfPacedLabProvisionItems) {
              await patchSelfPacedLabProvisionItem({
                name: item.metadata.name,
                namespace: item.metadata.namespace,
                patch: {
                  spec: {
                    parameters: {
                      ...item.spec.parameters,
                      salesforce_items: JSON.stringify(next),
                    },
                  },
                },
              });
            }
            if (!resourceClaims || resourceClaims.length === 0) return;
            for (const rc of resourceClaims) {
              const annotations = { ...rc.metadata.annotations };
              setSalesforceItemsAnno(annotations, next);
              await patchResourceClaim(rc.metadata.namespace, rc.metadata.name, { metadata: { annotations } });
            }
          }}
          isAdmin={isAdmin}
        />
      )}
      <Modal ref={modalDeleteRC} passModifiers={true} onConfirm={() => null}>
        <ResourceClaimDeleteModal onConfirm={onInstanceDeleteConfirm} resourceClaims={deleteTargetRCs} />
      </Modal>
      {isAdmin || sessionServiceNamespaces.length > 1 ? (
        <PageSection hasBodyWrapper={false} key="topbar" className="selfpacedlab-item__topbar">
          <ProjectSelector
            currentNamespaceName={serviceNamespaceName}
            onSelect={(namespace) => {
              if (namespace) {
                navigate(`/services/${namespace.name}${location.search}`);
              } else {
                navigate(`/services${location.search}`);
              }
            }}
          />
        </PageSection>
      ) : null}
      <PageSection hasBodyWrapper={false} key="head" className="selfpacedlab-item__head">
        <Split hasGutter>
          <SplitItem isFilled>
            <Breadcrumb>
              <BreadcrumbItem
                render={({ className }) => (
                  <Link to={`/services/${serviceNamespaceName}`} className={className}>
                    Services
                  </Link>
                )}
              />
              <BreadcrumbItem>{selfPacedLabName}</BreadcrumbItem>
            </Breadcrumb>
            <Title headingLevel="h4" size="xl" style={{ display: 'flex', alignItems: 'center' }}>
              {displayName(selfPacedLab)}
              {stage !== 'prod' ? <Label key="selfpacedlab-item__stage">{stage}</Label> : null}
              <Label key="selfpacedlab-item__type" tooltipDescription={<div>Self-paced lab with warm pool</div>}>
                Self-Paced Lab
              </Label>
            </Title>
          </SplitItem>
          <SplitItem>
            <Bullseye>
              <ServiceActions
                position="right"
                serviceName={displayName(selfPacedLab)}
                isLocked={isLocked}
                actionHandlers={{
                  delete: () => openModalDelete(),
                  deleteSelected:
                    selectedResourceClaims.length > 0
                      ? () => {
                          setDeleteTargetRCs(selectedResourceClaims);
                          openModalDeleteRC();
                        }
                      : undefined,
                }}
              />
            </Bullseye>
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection hasBodyWrapper={false} key="body" className="selfpacedlab-item__body">
        <Tabs
          activeKey={activeTab || 'details'}
          onSelect={(e, tabIndex) =>
            navigate(`/selfpacedlabs/${serviceNamespaceName}/${selfPacedLabName}/${tabIndex}`)
          }
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            {activeTab === 'details' || !activeTab ? (
              <DescriptionList isHorizontal className="selfpacedlab-item-details">
                <DescriptionListGroup>
                  <DescriptionListTerm>Name</DescriptionListTerm>
                  <DescriptionListDescription>
                    {selfPacedLab.metadata.name}
                    {isAdmin ? <OpenshiftConsoleLink resource={selfPacedLab} /> : null}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Lab URL</DescriptionListTerm>
                  <DescriptionListDescription>
                    {selfPacedLabId ? (
                      <Link to={`/selfpacedlab/${selfPacedLabId}`} target="_blank" rel="noopener">
                        {window.location.protocol}
                        {'//'}
                        {window.location.host}/selfpacedlab/{selfPacedLabId}
                      </Link>
                    ) : (
                      <LoadingIcon />
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Display Name</DescriptionListTerm>
                  <DescriptionListDescription>
                    <EditableText
                      aria-label="Edit Display Name"
                      onChange={(val: string) => patchSelfPacedLabSpec({ displayName: val })}
                      placeholder={selfPacedLab.metadata.name}
                      value={selfPacedLab.spec.displayName}
                    />
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Status</DescriptionListTerm>
                  <DescriptionListDescription>
                    {autoStartTime && autoStartTime > Date.now() ? (
                      <span className="services-item__status--scheduled">Scheduled</span>
                    ) : selfPacedLab.status?.poolCount ? (
                      <SelfPacedLabStatus poolCount={selfPacedLab.status.poolCount} />
                    ) : (
                      <Spinner size="md" />
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>
                    Description{' '}
                    <Tooltip position="right" content={<p>Description text visible in the user access page.</p>}>
                      <OutlinedQuestionCircleIcon
                        aria-label="Description text visible in the user access page."
                        className="tooltip-icon-only"
                      />
                    </Tooltip>
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    <Editor
                      onChange={(_: EditorState, editor: LexicalEditor) => {
                        editor.update(() => {
                          const html = $generateHtmlFromNodes(editor, null);
                          patchSelfPacedLabSpec({ description: html });
                        });
                      }}
                      placeholder="Add description"
                      defaultValue={selfPacedLab.spec.description}
                    />
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>
                    Access Password{' '}
                    <Tooltip position="right" content={<p>Password users need to enter to access the lab.</p>}>
                      <OutlinedQuestionCircleIcon
                        aria-label="Password users need to enter to access the lab."
                        className="tooltip-icon-only"
                      />
                    </Tooltip>
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    <EditableText
                      aria-label="Edit Access Password"
                      componentType="Password"
                      onChange={(val: string) => patchSelfPacedLabSpec({ accessPassword: val })}
                      placeholder="- no password -"
                      value={selfPacedLab.spec.accessPassword}
                    />
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>User Registration</DescriptionListTerm>
                  <DescriptionListDescription>
                    <Select
                      isOpen={userRegistrationSelectIsOpen}
                      onSelect={(_event, selected) => {
                        const selectedValue = typeof selected === 'string' ? selected : selected.toString();
                        patchSelfPacedLabSpec({ openRegistration: selectedValue === 'open' }).then(() =>
                          setUserRegistrationSelectIsOpen(false),
                        );
                      }}
                      selected={userRegistrationValue}
                      onOpenChange={(isOpen) => setUserRegistrationSelectIsOpen(isOpen)}
                      toggle={toggle}
                    >
                      <SelectList>
                        <SelectOption value="open">open registration</SelectOption>
                        <SelectOption value="pre">pre-registration</SelectOption>
                      </SelectList>
                    </Select>
                  </DescriptionListDescription>
                </DescriptionListGroup>
                {autoStartTime && autoStartTime > Date.now() ? (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Start Date</DescriptionListTerm>
                    <DescriptionListDescription>
                      <AutoStopDestroy
                        type="auto-start"
                        variant="extended"
                        isDisabled={isLocked}
                        onClick={() => {
                          if (!isLocked) {
                            setScheduleAction('scheduleStart');
                            openModalSchedule();
                          }
                        }}
                        time={autoStartTime}
                        className="selfpacedlab-item__schedule-btn"
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ) : null}
                <DescriptionListGroup>
                  <DescriptionListTerm>Auto-Destroy</DescriptionListTerm>
                  <DescriptionListDescription>
                    <AutoStopDestroy
                      type="auto-destroy"
                      isDisabled={isLocked}
                      onClick={() => {
                        if (!isLocked) {
                          setScheduleAction('scheduleDelete');
                          openModalSchedule();
                        }
                      }}
                      time={autoDestroyTime}
                      variant="extended"
                      className="selfpacedlab-item__schedule-btn"
                      notDefinedMessage="- Not defined -"
                    />
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Created</DescriptionListTerm>
                  <DescriptionListDescription>
                    <LocalTimestamp timestamp={selfPacedLab.metadata.creationTimestamp} /> (
                    <TimeInterval toTimestamp={selfPacedLab.metadata.creationTimestamp} />)
                  </DescriptionListDescription>
                </DescriptionListGroup>

                {selfPacedLabProvisionItems && selfPacedLabProvisionItems.length > 0 && sfdc_enabled ? (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Salesforce IDs</DescriptionListTerm>
                    <DescriptionListDescription>
                      <SalesforceItemsList
                        items={JSON.parse(selfPacedLabProvisionItems[0].spec.parameters?.['salesforce_items'] || '[]')}
                      />
                      <Button
                        variant="link"
                        icon={<PlusCircleIcon />}
                        onClick={() => setModalEditSalesforce(true)}
                        style={{ alignSelf: 'flex-start' }}
                      >
                        Add Salesforce IDs
                      </Button>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ) : null}

                {isAdmin ? (
                  <DescriptionListGroup className="selfpacedlab-item-details__admin-section">
                    <DescriptionListTerm>Admin Settings</DescriptionListTerm>
                    <DescriptionListDescription className="selfpacedlab-item-details__admin-description">
                      <div className="selfpacedlab-item-details__admin-fields">
                        <div className="selfpacedlab-item-details__admin-field">
                          <Switch
                            id="white-glove-switch"
                            aria-label="White-Glove Support"
                            label="White-Glove Support (for admins to tick when giving a white gloved experience)"
                            isChecked={whiteGloved}
                            hasCheckIcon
                            onChange={handleWhiteGloveChange}
                          />
                        </div>
                        <div className="selfpacedlab-item-details__admin-field">
                          <div className="selfpacedlab-item-details__group-control--single" style={{ maxWidth: 350 }}>
                            <label htmlFor="ops-effort-input">Ops Effort</label>
                            <NumberInput
                              id="ops-effort-input"
                              aria-label="Ops Effort"
                              min={0}
                              value={opsEffort}
                              onMinus={() => {
                                const newValue = Math.max(0, (typeof opsEffort === 'number' ? opsEffort : 0) - 1);
                                setOpsEffort(newValue);
                              }}
                              onPlus={() => {
                                const newValue = (typeof opsEffort === 'number' ? opsEffort : 0) + 1;
                                setOpsEffort(newValue);
                              }}
                              onChange={(event: React.FormEvent<HTMLInputElement>) => {
                                const inputValue = event.currentTarget.value;
                                const value = inputValue === '' ? 0 : parseInt(inputValue, 10);
                                if (!isNaN(value) && value >= 0) {
                                  setOpsEffort(value);
                                }
                              }}
                            />
                            <Tooltip position="right" content={<div>Operations effort value for this self-paced lab.</div>}>
                              <OutlinedQuestionCircleIcon
                                aria-label="Operations effort value for this self-paced lab."
                                className="tooltip-icon-only"
                              />
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                      <div
                        className="selfpacedlab-item-details__admin-field"
                        style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
                      >
                        <Switch
                          id="lock-switch"
                          aria-label="Locked"
                          label="Locked"
                          isChecked={isLocked}
                          hasCheckIcon
                          onChange={handleLockedChange}
                        />
                      </div>
                      <div
                        className="selfpacedlab-item-details__admin-field"
                        style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
                      >
                        <div className="selfpacedlab-item-details__group-control--single" style={{ maxWidth: 350 }}>
                          <label htmlFor="resource-pool-selector">Resource Pool</label>
                          <ResourcePoolSelector
                            disableAutoSelect
                            selectedPool={selectedResourcePool}
                            onSelect={handleResourcePoolChange}
                          />
                          <Tooltip position="right" content={<p>Select a specific resource pool for this lab.</p>}>
                            <OutlinedQuestionCircleIcon
                              aria-label="Select a specific resource pool for this lab"
                              className="tooltip-icon-only"
                            />
                          </Tooltip>
                        </div>
                      </div>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ) : null}
              </DescriptionList>
            ) : null}
          </Tab>
          <Tab eventKey="provision" title={<TabTitleText>Provisioning</TabTitleText>}>
            {activeTab === 'provision' ? (
              selfPacedLabProvisionItems && selfPacedLabProvisionItems.length > 0 ? (
                selfPacedLabProvisionItems.map((item) => (
                  <DescriptionList isHorizontal key={item.metadata.uid}>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Name</DescriptionListTerm>
                      <DescriptionListDescription>
                        {item.metadata.name}
                        {isAdmin ? <OpenshiftConsoleLink resource={item} /> : null}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Catalog Item</DescriptionListTerm>
                      <DescriptionListDescription>
                        {catalogItem ? (
                          <>
                            <Link to={`/catalog/${catalogItem.metadata.namespace}?item=${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`}>
                              {displayName(catalogItem)}
                            </Link>
                            {isAdmin ? <OpenshiftConsoleLink resource={catalogItem} /> : null}
                          </>
                        ) : (
                          <p>
                            Missing catalog item {item.spec.catalogItem.name} in {item.spec.catalogItem.namespace}
                          </p>
                        )}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Parameters</DescriptionListTerm>
                      <DescriptionListDescription>
                        <CodeBlock>
                          <CodeBlockCode>{yaml.dump(item.spec.parameters || {})}</CodeBlockCode>
                        </CodeBlock>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Pool Size</DescriptionListTerm>
                      <DescriptionListDescription>
                        <PatientNumberInput
                          min={0}
                          max={200}
                          adminModifier={true}
                          onChange={(value: number) =>
                            patchSelfPacedLabProvisionItem({
                              name: item.metadata.name,
                              namespace: item.metadata.namespace,
                              patch: { spec: { poolSize: value } },
                            }).then(() => mutateSelfPacedLabProvisionItems())
                          }
                          value={item.spec.poolSize}
                          style={{ paddingRight: 'var(--pf-t--global--spacer--md)' }}
                        />
                        <Tooltip position="right" content={<p>Number of pre-provisioned instances in the warm pool.</p>}>
                          <OutlinedQuestionCircleIcon
                            aria-label="Number of pre-provisioned instances in the warm pool."
                            className="tooltip-icon-only"
                          />
                        </Tooltip>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    {isAdmin ? (
                      <>
                        <DescriptionListGroup>
                          <DescriptionListTerm>Concurrency</DescriptionListTerm>
                          <DescriptionListDescription>
                            <PatientNumberInput
                              min={1}
                              max={30}
                              onChange={(value: number) =>
                                patchSelfPacedLabProvisionItem({
                                  name: item.metadata.name,
                                  namespace: item.metadata.namespace,
                                  patch: { spec: { concurrency: value } },
                                }).then(() => mutateSelfPacedLabProvisionItems())
                              }
                              value={item.spec.concurrency}
                              style={{ paddingRight: 'var(--pf-t--global--spacer--md)' }}
                            />
                            (only visible to admins)
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                          <DescriptionListTerm>Start Delay</DescriptionListTerm>
                          <DescriptionListDescription>
                            <PatientNumberInput
                              min={10}
                              max={999}
                              onChange={(value: number) =>
                                patchSelfPacedLabProvisionItem({
                                  name: item.metadata.name,
                                  namespace: item.metadata.namespace,
                                  patch: { spec: { startDelay: value } },
                                }).then(() => mutateSelfPacedLabProvisionItems())
                              }
                              value={item.spec.startDelay}
                              style={{ paddingRight: 'var(--pf-t--global--spacer--md)' }}
                            />
                            (only visible to admins)
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      </>
                    ) : null}
                    <DescriptionListGroup>
                      <DescriptionListTerm>
                        Assigned Lifespan{' '}
                        <Tooltip position="right" content={<p>How long an instance stays active after being assigned to a user.</p>}>
                          <OutlinedQuestionCircleIcon
                            aria-label="Assigned lifespan duration"
                            className="tooltip-icon-only"
                          />
                        </Tooltip>
                      </DescriptionListTerm>
                      <DescriptionListDescription>
                        <EditableText
                          aria-label="Edit Assigned Lifespan"
                          onChange={(val: string) =>
                            patchSelfPacedLabProvisionItem({
                              name: item.metadata.name,
                              namespace: item.metadata.namespace,
                              patch: { spec: { assignedLifespan: val } },
                            }).then(() => mutateSelfPacedLabProvisionItems())
                          }
                          placeholder="e.g. 4h"
                          value={item.spec.assignedLifespan}
                        />
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>
                        Unassigned Lifespan{' '}
                        <Tooltip position="right" content={<p>How long an unassigned instance stays in the pool before being recycled.</p>}>
                          <OutlinedQuestionCircleIcon
                            aria-label="Unassigned lifespan duration"
                            className="tooltip-icon-only"
                          />
                        </Tooltip>
                      </DescriptionListTerm>
                      <DescriptionListDescription>
                        <EditableText
                          aria-label="Edit Unassigned Lifespan"
                          onChange={(val: string) =>
                            patchSelfPacedLabProvisionItem({
                              name: item.metadata.name,
                              namespace: item.metadata.namespace,
                              patch: { spec: { unassignedLifespan: val } },
                            }).then(() => mutateSelfPacedLabProvisionItems())
                          }
                          placeholder="e.g. 24h"
                          value={item.spec.unassignedLifespan}
                        />
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  </DescriptionList>
                ))
              ) : selfPacedLabProvisionItems ? (
                <EmptyState headingLevel="h4" titleText="No SelfPacedLabProvisionItems found" variant="sm">
                  <EmptyStateBody>
                    This indicates an error has occurred. A SelfPacedLabProvisionItem should have been created when this lab was created.
                  </EmptyStateBody>
                </EmptyState>
              ) : (
                <Spinner size="lg" />
              )
            ) : null}
          </Tab>
          <Tab eventKey="instances" title={<TabTitleText>Instances ({resourceClaims ? activeResourceClaims.length : '...'})</TabTitleText>}>
            {activeTab === 'instances' ? (
              resourceClaims && activeResourceClaims.length > 0 ? (
                <SelectableTable
                    columns={
                      isAdmin
                        ? ['Name', 'Status', 'Assignment', 'Created At', 'Actions']
                        : ['Name', 'Status', 'Assignment', 'Created At']
                    }
                    onSelectAll={(isSelected) => {
                      if (isSelected) {
                        setSelectedUids(activeResourceClaims.map((rc) => rc.metadata.uid));
                      } else {
                        setSelectedUids([]);
                      }
                    }}
                    rows={activeResourceClaims.map((rc) => {
                      const userAssignments = userAssignmentsList?.items || [];
                      return {
                        cells: [
                          <>
                            <Link key="link" to={`/services/${rc.metadata.namespace}/${rc.metadata.name}`}>
                              {displayName(rc)}
                            </Link>
                            {isAdmin ? <OpenshiftConsoleLink key="console" resource={rc} /> : null}
                          </>,
                          <ServiceStatus key="status" resourceClaim={rc} />,
                          <>
                            {userAssignments.some((uA) => uA.spec.resourceClaimName === rc.metadata.name)
                              ? userAssignments
                                  .filter((uA) => uA.spec.resourceClaimName === rc.metadata.name)
                                  .map((uA) => (
                                    <p key={`user-${uA.spec.assignment?.email || 'unassigned'}`}>
                                      {uA.spec.assignment?.email || '-'}
                                    </p>
                                  ))
                              : '-'}
                          </>,
                          <>
                            <LocalTimestamp key="ts" timestamp={rc.metadata.creationTimestamp} /> (
                            <TimeInterval key="iv" toTimestamp={rc.metadata.creationTimestamp} />)
                          </>,
                          ...(isAdmin
                            ? [
                                <ButtonCircleIcon
                                  key="actions"
                                  onClick={() => {
                                    setDeleteTargetRCs([rc]);
                                    openModalDeleteRC();
                                  }}
                                  description="Delete"
                                  icon={TrashIcon}
                                />,
                              ]
                            : []),
                        ],
                        onSelect: (isSelected: boolean) =>
                          setSelectedUids((uids) => {
                            if (isSelected) {
                              return uids.includes(rc.metadata.uid) ? uids : [...uids, rc.metadata.uid];
                            }
                            return uids.filter((uid) => uid !== rc.metadata.uid);
                          }),
                        selected: selectedUids.includes(rc.metadata.uid),
                      };
                    })}
                  />
              ) : resourceClaims ? (
                <EmptyState headingLevel="h4" titleText="No instances" variant="sm">
                  <EmptyStateBody>No pool instances found for this self-paced lab.</EmptyStateBody>
                </EmptyState>
              ) : (
                <Spinner size="lg" />
              )
            ) : null}
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            {activeTab === 'yaml' ? (
              <MonacoEditor
                height="500px"
                language="yaml"
                options={{ readOnly: true }}
                theme="vs-dark"
                value={yaml.dump(selfPacedLab)}
              />
            ) : null}
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const SelfPacedLabItem: React.FC = () => {
  const { name: selfPacedLabName, namespace: serviceNamespaceName, tab: activeTab = 'details' } = useParams();
  return (
    <ErrorBoundaryPage namespace={serviceNamespaceName} name={selfPacedLabName} type="Self-Paced Lab">
      <SelfPacedLabItemComponent
        activeTab={activeTab}
        selfPacedLabName={selfPacedLabName}
        serviceNamespaceName={serviceNamespaceName}
      />
    </ErrorBoundaryPage>
  );
};

export default SelfPacedLabItem;
