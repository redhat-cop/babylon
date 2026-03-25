import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import useSWR, { mutate } from 'swr';
import { DragDropSort, DragDropSortDragEndEvent } from '@patternfly/react-drag-drop';
import {
  PageSection,
  Title,
  Split,
  SplitItem,
  Button,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Breadcrumb,
  BreadcrumbItem,
  EmptyState,
  EmptyStateBody,
  Tabs,
  Tab,
  TabTitleText,
  NumberInput,
  Checkbox,
  SearchInput,
} from '@patternfly/react-core';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@patternfly/react-table';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import Modal, { useModal } from '@app/Modal/Modal';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import { apiPaths, fetcher, patchMultiWorkshop, deleteMultiWorkshop, deleteAssetFromMultiWorkshop, dateToApiString, fetcherItemsInAllPages, addOwnerReferenceToWorkshop } from '@app/api';
import { MultiWorkshop, ResourceClaim, ServiceAccess, Workshop } from '@app/types';
import TimeInterval from '@app/components/TimeInterval';
import EditableText from '@app/components/EditableText';
import Label from '@app/components/Label';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import SalesforceItemsField from '@app/components/SalesforceItemsField';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import WorkshopStatus from '@app/Workshops/WorkshopStatus';
import DateTimePicker from '@app/components/DateTimePicker';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import useSession from '@app/utils/useSession';
import purposeOptions from './purposeOptions.json';
import { BABYLON_DOMAIN, compareK8sObjectsArr, FETCH_BATCH_LIMIT } from '@app/util';
import ExternalWorkshopModal from './ExternalWorkshopModal';
import Footer from '@app/components/Footer';

import './multiworkshop-detail.css';

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

const AssetWorkshopStatus: React.FC<{ workshopName: string; namespace: string }> = ({ workshopName, namespace }) => {
  const { data: resourceClaims, isLoading } = useSWR<ResourceClaim[]>(
    workshopName && namespace
      ? apiPaths.RESOURCE_CLAIMS({
          namespace,
          labelSelector: `${BABYLON_DOMAIN}/workshop=${workshopName}`,
          limit: 'ALL',
        })
      : null,
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.RESOURCE_CLAIMS({
          namespace,
          labelSelector: `${BABYLON_DOMAIN}/workshop=${workshopName}`,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        }),
      ),
    {
      refreshInterval: 8000,
      compare: compareK8sObjectsArr,
    },
  );

  if (isLoading) return <LoadingIcon />;
  if (!resourceClaims || resourceClaims.length === 0) return <span>-</span>;
  return <WorkshopStatus resourceClaims={resourceClaims} />;
};

const MultiWorkshopDetail: React.FC = () => {
  const navigate = useNavigate();
  const { namespace, name } = useParams();
  const { userNamespace, isAdmin } = useSession().getSession();
  const [activeTab, setActiveTab] = useState<string>('details');
  const [modalDelete, openModalDelete] = useModal();
  const [modalDeleteAsset, openModalDeleteAsset] = useModal();

  const [modalAddWorkshop, openModalAddWorkshop] = useModal();
  const [modalExternalWorkshop, openModalExternalWorkshop] = useModal();
  const [selectedWorkshops, setSelectedWorkshops] = useState<string[]>([]);
  const [workshopSearchValue, setWorkshopSearchValue] = useState('');
  const [assetToDelete, setAssetToDelete] = useState<{ index: number; asset: { type?: string; displayName?: string; key?: string; workshopName?: string; url?: string; name?: string } } | null>(null);

  const { data: multiworkshop, error } = useSWR<MultiWorkshop>(
    namespace && name ? apiPaths.MULTIWORKSHOP({ namespace, multiworkshopName: name }) : null,
    fetcher,
    {
      refreshInterval: 8000,
    }
  );

  // Fetch workshops in the same namespace as the MultiWorkshop
  const { data: workshops } = useSWR<Workshop[]>(
    namespace ? `workshops-${namespace}` : null,
    () => fetcherItemsInAllPages((continueId) =>
      apiPaths.WORKSHOPS({ namespace, limit: FETCH_BATCH_LIMIT, continueId })
    ),
    {
      refreshInterval: 30000,
    }
  );

  // Fetch workshops shared with the user via ServiceAccess
  const { data: sharedWorkshops } = useSWR<Workshop[]>(
    namespace ? `shared-workshops-${namespace}` : null,
    async () => {
      const serviceAccesses = await fetcherItemsInAllPages((continueId) =>
        apiPaths.SERVICE_ACCESSES({ namespace, limit: FETCH_BATCH_LIMIT, continueId })
      ) as ServiceAccess[];

      const result: Workshop[] = [];
      for (const sa of serviceAccesses) {
        if (sa.spec.kind === 'Workshop') {
          try {
            const workshop = await fetcher(
              apiPaths.WORKSHOP({ namespace: sa.spec.namespace, workshopName: sa.spec.name })
            ) as Workshop;
            result.push(workshop);
          } catch (e) {
            console.warn(`Failed to fetch shared workshop ${sa.spec.namespace}/${sa.spec.name}:`, e);
          }
        }
      }
      return result;
    },
    { refreshInterval: 30000 }
  );

  function getMultiWorkshopDisplayName(multiworkshop: MultiWorkshop): string {
    return multiworkshop.spec.displayName || multiworkshop.spec.name || multiworkshop.metadata.name;
  }

  async function updateEventTitle(newTitle: string): Promise<void> {
    if (!multiworkshop) return;
    
    const updatedMultiWorkshop = await patchMultiWorkshop({
      name: multiworkshop.metadata.name,
      namespace: multiworkshop.metadata.namespace,
      patch: { 
        spec: { 
          displayName: newTitle,
          name: newTitle
        } 
      },
    });
    
    // Update local data via SWR mutate for immediate UI update
    mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
  }

  async function updateEventDescription(newDescription: string): Promise<void> {
    if (!multiworkshop) return;
    
    const updatedMultiWorkshop = await patchMultiWorkshop({
      name: multiworkshop.metadata.name,
      namespace: multiworkshop.metadata.namespace,
      patch: { 
        spec: { 
          description: newDescription
        } 
      },
    });
    
    // Update local data via SWR mutate for immediate UI update
    mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
  }

  async function updateAssetDisplayName(assetIndex: number, newDisplayName: string): Promise<void> {
    if (!multiworkshop || !multiworkshop.spec.assets) return;
    
    const updatedAssets = [...multiworkshop.spec.assets];
    updatedAssets[assetIndex] = { ...updatedAssets[assetIndex], displayName: newDisplayName };
    
    const updatedMultiWorkshop = await patchMultiWorkshop({
      name: multiworkshop.metadata.name,
      namespace: multiworkshop.metadata.namespace,
      patch: { 
        spec: { 
          assets: updatedAssets
        } 
      },
    });
    
    // Update local data via SWR mutate for immediate UI update
    mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
  }

  async function updateAssetDescription(assetIndex: number, newDescription: string): Promise<void> {
    if (!multiworkshop || !multiworkshop.spec.assets) return;
    
    const updatedAssets = [...multiworkshop.spec.assets];
    updatedAssets[assetIndex] = { ...updatedAssets[assetIndex], description: newDescription };
    
    const updatedMultiWorkshop = await patchMultiWorkshop({
      name: multiworkshop.metadata.name,
      namespace: multiworkshop.metadata.namespace,
      patch: { 
        spec: { 
          assets: updatedAssets
        } 
      },
    });
    
    // Update local data via SWR mutate for immediate UI update
    mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
  }

  async function onDeleteConfirm(): Promise<void> {
    if (!multiworkshop) return;
    
    await deleteMultiWorkshop(multiworkshop);
    
    // Clear workshops cache since associated workshops are also deleted
    mutate(`workshops-${namespace}`, undefined, false);
    
    // Navigate back to the list page
    const currentNamespace = namespace || userNamespace?.name;
    navigate(currentNamespace ? `/multi-workshop/${currentNamespace}` : '/multi-workshop');
  }

  async function onDeleteAssetConfirm(): Promise<void> {
    if (!multiworkshop || !assetToDelete) return;
    
    try {
      const updatedMultiWorkshop = await deleteAssetFromMultiWorkshop({
        multiworkshop,
        assetIndex: assetToDelete.index,
      });
      
      // Update local data via SWR mutate for immediate UI update
      mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
      
      // Clear the asset to delete
      setAssetToDelete(null);
    } catch (error) {
      console.error('Failed to delete asset:', error);
      // You might want to show an error message here
    }
  }

  function showDeleteAssetModal(index: number, asset: { type?: string; displayName?: string; key?: string; workshopName?: string; url?: string; name?: string }): void {
    setAssetToDelete({ index, asset });
    openModalDeleteAsset();
  }

  async function handleAssetDrop(_event: DragDropSortDragEndEvent, _items: unknown[], oldIndex: number, newIndex: number): Promise<void> {
    if (oldIndex === newIndex || !multiworkshop?.spec.assets) return;

    const reorderedAssets = [...multiworkshop.spec.assets];
    const [moved] = reorderedAssets.splice(oldIndex, 1);
    reorderedAssets.splice(newIndex, 0, moved);

    const swrKey = apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name });

    mutate(swrKey, { ...multiworkshop, spec: { ...multiworkshop.spec, assets: reorderedAssets } }, false);

    try {
      const updatedMultiWorkshop = await patchMultiWorkshop({
        name: multiworkshop.metadata.name,
        namespace: multiworkshop.metadata.namespace,
        patch: { spec: { assets: reorderedAssets } },
      });
      mutate(swrKey, updatedMultiWorkshop, false);
    } catch (error) {
      mutate(swrKey, multiworkshop, false);
      console.error('Failed to reorder assets:', error);
    }
  }

  async function onAddWorkshopsConfirm(): Promise<void> {
    if (!multiworkshop || selectedWorkshops.length === 0) return;

    try {
      const selectedEntries = allAvailableWorkshops.filter(
        ({ workshop }) => selectedWorkshops.includes(workshop.metadata.uid),
      );

      const newAssets = selectedEntries.map(({ workshop }) => {
        const asset: Record<string, string> = {
          key: workshop.metadata?.labels?.[`${BABYLON_DOMAIN}/catalogItemName`] || workshop.metadata.name,
          name: workshop.metadata.name,
          namespace: workshop.metadata.namespace,
          displayName: workshop.spec?.displayName || workshop.metadata.name,
          description: stripHtmlTags(workshop.spec?.description || ''),
          type: 'Workshop',
        };
        const workshopId = workshop.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop-id`];
        if (workshopId) {
          asset.workshopId = workshopId;
        }
        return asset;
      });

      // Only add ownerReferences for local (same-namespace) workshops;
      // cross-namespace ownerReferences are not supported by Kubernetes
      const ownerReference = {
        apiVersion: `${BABYLON_DOMAIN}/v1`,
        controller: true,
        kind: 'MultiWorkshop',
        name: multiworkshop.metadata.name,
        uid: multiworkshop.metadata.uid,
      };

      await Promise.all(
        selectedEntries
          .filter(({ isShared }) => !isShared)
          .map(async ({ workshop }) => {
            await addOwnerReferenceToWorkshop({ workshop, ownerReference });
          }),
      );

      const existingAssets = multiworkshop.spec.assets || [];
      const combinedAssets = [...existingAssets, ...newAssets];

      const updatedMultiWorkshop = await patchMultiWorkshop({
        name: multiworkshop.metadata.name,
        namespace: multiworkshop.metadata.namespace,
        patch: {
          spec: {
            assets: combinedAssets,
          },
        },
      });

      mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
      setSelectedWorkshops([]);
    } catch (error) {
      console.error('Failed to add workshops:', error);
    }
  }

  async function onAddExternalWorkshopConfirm(data: { url: string; displayName: string; description: string }): Promise<void> {
    if (!multiworkshop) return;
    
    try {
      // Create new external asset
      const newExternalAsset = {
        key: `external-${Date.now()}`, // Generate unique key for external workshop
        name: data.displayName || `external-${Date.now()}`, // Use display name or generate unique name
        url: data.url,
        displayName: data.displayName,
        description: data.description,
        type: 'external' as const,
      };

      // Combine existing assets with new external asset
      const existingAssets = multiworkshop.spec.assets || [];
      const combinedAssets = [...existingAssets, newExternalAsset];

      const updatedMultiWorkshop = await patchMultiWorkshop({
        name: multiworkshop.metadata.name,
        namespace: multiworkshop.metadata.namespace,
        patch: { 
          spec: { 
            assets: combinedAssets
          } 
        },
      });
      
      // Update local data via SWR mutate for immediate UI update
      mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
    } catch (error) {
      console.error('Failed to add external workshop:', error);
      // You might want to show an error message here
    }
  }

  function revalidateWorkshopsAfterSync(): void {
    setTimeout(() => mutate(`workshops-${namespace}`), 2000);
    setTimeout(() => mutate(`workshops-${namespace}`), 5000);
  }

  // Combine local and shared workshops into a unified available list
  const allAvailableWorkshops = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ workshop: Workshop; isShared: boolean }> = [];

    const existingAssetKeys = new Set(
      (multiworkshop?.spec.assets || [])
        .filter(a => a.type === 'Workshop' && a.name)
        .map(a => `${a.namespace || namespace}/${a.name}`),
    );

    for (const w of workshops || []) {
      if (w.metadata.deletionTimestamp) continue;
      if (w.metadata.ownerReferences?.length > 0) continue;
      if (existingAssetKeys.has(`${w.metadata.namespace}/${w.metadata.name}`)) continue;
      seen.add(w.metadata.uid);
      result.push({ workshop: w, isShared: false });
    }

    for (const w of sharedWorkshops || []) {
      if (w.metadata.deletionTimestamp) continue;
      if (seen.has(w.metadata.uid)) continue;
      if (existingAssetKeys.has(`${w.metadata.namespace}/${w.metadata.name}`)) continue;
      seen.add(w.metadata.uid);
      result.push({ workshop: w, isShared: true });
    }

    return result;
  }, [workshops, sharedWorkshops, multiworkshop, namespace]);

  // Filter combined list by search value
  const filteredAvailableWorkshops = allAvailableWorkshops.filter(({ workshop }) => {
    if (!workshopSearchValue.trim()) return true;
    const searchLower = workshopSearchValue.toLowerCase();
    const displayName = workshop.spec?.displayName || workshop.metadata.name;
    return (
      displayName.toLowerCase().includes(searchLower) ||
      workshop.metadata.name.toLowerCase().includes(searchLower) ||
      workshop.metadata.namespace.toLowerCase().includes(searchLower) ||
      (workshop.spec?.description && workshop.spec.description.toLowerCase().includes(searchLower))
    );
  });

  if (error) {
    return (
      <PageSection>
        <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="Error loading multi asset workshop" variant="full">
          <EmptyStateBody>
            {error.status === 404 ? 
              'The requested multi asset workshop was not found.' : 
              'An error occurred while loading the multi asset workshop details.'
            }
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  if (!multiworkshop) {
    return (
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          Loading...
        </Title>
      </PageSection>
    );
  }

  // Use the namespace from the multiworkshop or fallback to user namespace
  const currentNamespace = namespace || userNamespace?.name;

  return (
    <div className="multiworkshop-detail">
      <Modal
        ref={modalDelete}
        onConfirm={onDeleteConfirm}
        title={`Delete multi asset workshop ${getMultiWorkshopDisplayName(multiworkshop)}?`}
      >
        <p>This action cannot be undone. All associated workshop data will be deleted.</p>
      </Modal>

      <Modal
        ref={modalDeleteAsset}
        onConfirm={onDeleteAssetConfirm}
        title={`Delete asset "${assetToDelete?.asset?.displayName || assetToDelete?.asset?.key || 'Unknown'}"?`}
      >
        <p>This action cannot be undone. 
          {assetToDelete?.asset?.type !== 'external' && assetToDelete?.asset?.workshopName 
            ? ' The associated workshop will also be deleted.' 
            : ' The asset will be removed from this event.'}
        </p>
      </Modal>

      <Modal
        ref={modalAddWorkshop}
        onConfirm={onAddWorkshopsConfirm}
        title="Add Existing Workshops"
        confirmText="Add Selected Workshops"
        isDisabled={selectedWorkshops.length === 0}
        variant="large"
        onClose={() => {
          setSelectedWorkshops([]);
          setWorkshopSearchValue('');
        }}
      >
        <div>
          <p style={{ marginBottom: '16px' }}>
            Select workshops from your namespace or shared with you to add to this event.
          </p>
          
          <SearchInput
            placeholder="Search workshops..."
            value={workshopSearchValue}
            onChange={(_event, value) => setWorkshopSearchValue(value)}
            onClear={() => setWorkshopSearchValue('')}
            style={{ marginBottom: '16px' }}
          />

          {filteredAvailableWorkshops.length === 0 ? (
            <EmptyState variant="sm">
              <EmptyStateBody>
                {allAvailableWorkshops.length === 0 
                  ? "No workshops available. All existing workshops may already be included, or no workshops have been shared with you."
                  : "No workshops match your search criteria."
                }
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <Table aria-label="Available workshops" variant="compact">
              <Thead>
                <Tr>
                  <Th width={10}></Th>
                  <Th>Display Name</Th>
                  <Th>Name</Th>
                  <Th>Namespace</Th>
                  <Th width={15}>Created</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredAvailableWorkshops.map(({ workshop, isShared }) => {
                  const uid = workshop.metadata.uid;
                  const handleSelectionToggle = () => {
                    const isSelected = selectedWorkshops.includes(uid);
                    if (isSelected) {
                      setSelectedWorkshops(prev => prev.filter(id => id !== uid));
                    } else {
                      setSelectedWorkshops(prev => [...prev, uid]);
                    }
                  };

                  return (
                    <Tr 
                      key={uid}
                      isSelectable
                      isRowSelected={selectedWorkshops.includes(uid)}
                    >
                      <Td>
                        <Checkbox
                          id={`workshop-${uid}`}
                          isChecked={selectedWorkshops.includes(uid)}
                          onChange={handleSelectionToggle}
                        />
                      </Td>
                      <Td onClick={handleSelectionToggle} style={{ cursor: 'pointer' }}>
                        <strong>{workshop.spec?.displayName || workshop.metadata.name}</strong>
                        {isShared ? (
                          <Label key="shared-label" tooltipDescription={<div>This workshop has been shared with you</div>}>
                            Shared
                          </Label>
                        ) : null}
                      </Td>
                      <Td onClick={handleSelectionToggle} style={{ cursor: 'pointer' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '14px' }}>
                          {workshop.metadata.name}
                        </span>
                      </Td>
                      <Td onClick={handleSelectionToggle} style={{ cursor: 'pointer' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '14px' }}>
                          {workshop.metadata.namespace}
                        </span>
                      </Td>
                      <Td onClick={handleSelectionToggle} style={{ cursor: 'pointer' }}>
                        <TimeInterval toTimestamp={workshop.metadata.creationTimestamp} />
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
          
          {selectedWorkshops.length > 0 && (
            <div style={{ 
              marginTop: '16px', 
              padding: '12px', 
              backgroundColor: 'var(--pf-t--global--background--color--200)',
              borderRadius: '4px'
            }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>
                {selectedWorkshops.length} workshop{selectedWorkshops.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          )}
        </div>
      </Modal>

      <ExternalWorkshopModal
        ref={modalExternalWorkshop}
        onConfirm={onAddExternalWorkshopConfirm}
      />

      <PageSection variant="default">
        <Breadcrumb>
          <BreadcrumbItem>
            <Button 
              variant="link" 
              onClick={() => navigate(currentNamespace ? `/multi-workshop/${currentNamespace}` : '/multi-workshop')}
            >
              Multi Asset Workshop
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{getMultiWorkshopDisplayName(multiworkshop)}</BreadcrumbItem>
        </Breadcrumb>
        
        <Split hasGutter className="multiworkshop-detail__header">
          <SplitItem isFilled>
            <Title headingLevel="h1" size="2xl" style={{ display: 'flex', alignItems: 'center' }}>
              {getMultiWorkshopDisplayName(multiworkshop)}
              <Label key="multi-workshop-label" tooltipDescription={<div>Multi Asset Workshop interface</div>}>
                Multi Asset Workshop
              </Label>
            </Title>
          </SplitItem>
          <SplitItem>
            <ButtonCircleIcon
              onClick={openModalDelete}
              description="Delete Multi Asset Workshop"
              icon={TrashIcon}
            />
          </SplitItem>
        </Split>
      </PageSection>

      <PageSection hasBodyWrapper={false} style={{ paddingTop: 0, flexGrow: 1 }}>
        <Tabs
          activeKey={activeTab}
          onSelect={(e, tabIndex) => setActiveTab(tabIndex as string)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            {activeTab === 'details' ? (
              <>
                <DescriptionList isHorizontal className="multiworkshop-detail__details">
                  <DescriptionListGroup>
                    <DescriptionListTerm>Display Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      <EditableText
                        value={getMultiWorkshopDisplayName(multiworkshop)}
                        onChange={updateEventTitle}
                        placeholder="Event display name"
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      <span style={{ fontFamily: 'var(--pf-t--global--font--family--mono)', marginRight: '8px' }}>
                        {multiworkshop.metadata.name}
                      </span>
                      <OpenshiftConsoleLink resource={multiworkshop} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Portal URL</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Link
                        to={`/event/${multiworkshop.metadata.namespace}/${multiworkshop.metadata.name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {`${window.location.origin}/event/${multiworkshop.metadata.namespace}/${multiworkshop.metadata.name}`}
                      </Link>
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Start provisioning date</DescriptionListTerm>
                    <DescriptionListDescription>
                      <DateTimePicker
                        defaultTimestamp={multiworkshop.spec.startDate ? new Date(multiworkshop.spec.startDate).getTime() : Date.now()}
                        isDisabled={!!multiworkshop.spec.startDate && new Date(multiworkshop.spec.startDate).getTime() < Date.now()}
                        onSelect={async (date) => {
                          const apiDate = dateToApiString(date);
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { spec: { startDate: apiDate } },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                          revalidateWorkshopsAfterSync();
                        }}
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>End Date</DescriptionListTerm>
                    <DescriptionListDescription>
                      <DateTimePicker
                        defaultTimestamp={multiworkshop.spec.endDate ? new Date(multiworkshop.spec.endDate).getTime() : Date.now()}
                        onSelect={async (date) => {
                          const apiDate = dateToApiString(date);
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { spec: { endDate: apiDate } },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                          revalidateWorkshopsAfterSync();
                        }}
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Description</DescriptionListTerm>
                    <DescriptionListDescription>
                      <EditableText
                        value={multiworkshop.spec.description || ''}
                        onChange={updateEventDescription}
                        componentType="TextArea"
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Background Image</DescriptionListTerm>
                    <DescriptionListDescription>
                      <EditableText
                        value={multiworkshop.spec.backgroundImage || ''}
                        onChange={async (value) => {
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { spec: { backgroundImage: value } },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                        }}
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Logo Image</DescriptionListTerm>
                    <DescriptionListDescription>
                      <EditableText
                        value={multiworkshop.spec.logoImage || ''}
                        onChange={async (value) => {
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { spec: { logoImage: value } },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                        }}
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Created</DescriptionListTerm>
                    <DescriptionListDescription>
                      <TimeInterval toTimestamp={multiworkshop.metadata.creationTimestamp} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>

                <div className="multiworkshop-detail__defaults-section">
                  <div className="multiworkshop-detail__defaults-heading">Default Provisioning Settings</div>
                  <DescriptionList isHorizontal className="multiworkshop-detail__details">
                    <DescriptionListGroup>
                      <DescriptionListTerm>Number of Seats</DescriptionListTerm>
                      <DescriptionListDescription>
                        <NumberInput
                          value={multiworkshop.spec.numberSeats || 1}
                          isDisabled
                          onMinus={() => undefined}
                          onPlus={() => undefined}
                          onChange={() => undefined}
                          min={1}
                          widthChars={10}
                        />
                      </DescriptionListDescription>
                    </DescriptionListGroup>

                    <DescriptionListGroup>
                      <DescriptionListTerm>Activity & Purpose</DescriptionListTerm>
                      <DescriptionListDescription>
                        <ActivityPurposeSelector
                          value={{
                            activity: multiworkshop.spec['purpose-activity'] || '',
                            purpose: multiworkshop.spec.purpose || '',
                          }}
                          purposeOpts={purposeOptions}
                          onChange={() => undefined}
                        />
                      </DescriptionListDescription>
                    </DescriptionListGroup>

                    <DescriptionListGroup>
                      <DescriptionListTerm>Salesforce IDs</DescriptionListTerm>
                      <DescriptionListDescription>
                        <SalesforceItemsField
                          label=""
                          items={multiworkshop.spec.salesforceItems || []}
                          onChange={() => undefined}
                        />
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  </DescriptionList>
                </div>

              </>
            ) : null}
          </Tab>
          <Tab eventKey="assets" title={<TabTitleText>Workshop Assets</TabTitleText>}>
            {activeTab === 'assets' ? (
              <>
                <Split hasGutter style={{ marginBottom: '24px' }}>
                  <SplitItem isFilled>
                    <Title headingLevel="h2" size="xl">
                      Workshop Assets ({multiworkshop.spec.assets?.length || 0})
                    </Title>
                  </SplitItem>
                  <SplitItem>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      {isAdmin && (
                        <Button 
                          variant="primary" 
                          onClick={openModalAddWorkshop}
                          isDisabled={allAvailableWorkshops.length === 0}
                        >
                          Add preprovisioned asset
                        </Button>
                      )}
                      <Button 
                        variant="secondary" 
                        onClick={openModalExternalWorkshop}
                      >
                        Add External Asset
                      </Button>
                    </div>
                  </SplitItem>
                </Split>
                
                {multiworkshop.spec.assets && multiworkshop.spec.assets.length > 0 ? (
                  <>
                    <div className="asset-grid asset-grid--header">
                      <div>Asset Name</div>
                      <div>Display Name</div>
                      <div>Description</div>
                      <div>Status</div>
                      <div>Auto-Destroy</div>
                      <div>Workshop Status</div>
                      <div>Actions</div>
                    </div>
                    <DragDropSort
                      items={multiworkshop.spec.assets.map((asset, index) => ({
                        id: asset.key || `asset-${index}`,
                        props: { className: 'asset-draggable-row' },
                        content: (
                          <div className="asset-grid asset-grid--row">
                            <div>
                              {asset.type === 'external' ? (
                                <a 
                                  href={asset.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ textDecoration: 'none', color: 'var(--pf-t--color--link--default)' }}
                                >
                                  {asset.displayName || asset.key}
                                </a>
                              ) : asset.name && asset.type === 'Workshop' ? (
                                <Link 
                                  to={`/workshops/${asset.namespace}/${asset.name}`}
                                  style={{ textDecoration: 'none' }}
                                >
                                  {asset.name}
                                </Link>
                              ) : (
                                <span style={{ color: 'var(--pf-t--color--text--secondary)', fontStyle: 'italic' }}>
                                  Not created yet
                                </span>
                              )}
                            </div>
                            <div>
                              <EditableText
                                value={asset.displayName || ''}
                                onChange={(value: string) => updateAssetDisplayName(index, value)}
                                placeholder="Workshop display name"
                              />
                            </div>
                            <div>
                              <EditableText
                                value={asset.description || ''}
                                onChange={(value: string) => updateAssetDescription(index, value)}
                                componentType="TextArea"
                              />
                            </div>
                            <div>
                              {asset.type === 'external' ? (
                                <span>External</span>
                              ) : asset.workshopId ? (
                                <span>Created</span>
                              ) : (
                                <span>Pending</span>
                              )}
                            </div>
                            <div>
                              {(() => {
                                if (asset.type !== 'Workshop' || !asset.name) return <span>-</span>;
                                const workshop = workshops?.find(w => w.metadata.name === asset.name);
                                const lifespanEnd = workshop?.spec?.lifespan?.end;
                                return lifespanEnd ? <LocalTimestamp timestamp={lifespanEnd} /> : <span>-</span>;
                              })()}
                            </div>
                            <div>
                              {asset.type === 'Workshop' && asset.name ? (
                                <AssetWorkshopStatus
                                  workshopName={asset.name}
                                  namespace={multiworkshop.metadata.namespace}
                                />
                              ) : (
                                <span>-</span>
                              )}
                            </div>
                            <div>
                              <ButtonCircleIcon
                                onClick={() => showDeleteAssetModal(index, asset)}
                                description="Delete asset"
                                icon={TrashIcon}
                              />
                            </div>
                          </div>
                        ),
                      }))}
                      onDrop={handleAssetDrop}
                      variant="default"
                    />
                  </>
                ) : (
                  <EmptyState variant="lg">
                    <EmptyStateBody>
                      No workshop assets configured for this event.
                    </EmptyStateBody>
                  </EmptyState>
                )}
              </>
            ) : null}
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            {activeTab === 'yaml' ? (
              <Editor
                height="500px"
                language="yaml"
                options={{ readOnly: true }}
                theme="vs-dark"
                value={yaml.dump(multiworkshop)}
              />
            ) : null}
          </Tab>
        </Tabs>
      </PageSection>
      <Footer />
    </div>
  );
};

export default MultiWorkshopDetail;
