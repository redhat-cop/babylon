import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import useSWR, { mutate } from 'swr';
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
  TextInput,
  NumberInput,
  Checkbox,
  SearchInput,
} from '@patternfly/react-core';
import { ModalVariant } from '@patternfly/react-core/deprecated';
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
import { apiPaths, fetcher, patchMultiWorkshop, deleteMultiWorkshop, deleteAssetFromMultiWorkshop, dateToApiString, fetcherItemsInAllPages } from '@app/api';
import { MultiWorkshop, SfdcType, Workshop, WorkshopList } from '@app/types';
import LocalTimestamp from '@app/components/LocalTimestamp';
import TimeInterval from '@app/components/TimeInterval';
import EditableText from '@app/components/EditableText';
import Label from '@app/components/Label';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import SalesforceIdField from './SalesforceIdField';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import useSession from '@app/utils/useSession';
import purposeOptions from './purposeOptions.json';
import { FETCH_BATCH_LIMIT } from '@app/util';
import ExternalWorkshopModal from './ExternalWorkshopModal';

import './multiworkshop-detail.css';

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
  const [assetToDelete, setAssetToDelete] = useState<{ index: number; asset: any } | null>(null);

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
      refreshInterval: 30000, // Refresh less frequently than multiworkshop
    }
  );

  function getMultiWorkshopDisplayName(multiworkshop: MultiWorkshop): string {
    return multiworkshop.spec.displayName || multiworkshop.spec.name || multiworkshop.metadata.name;
  }

  function apiDateToLocalDateTime(apiDate: string): string {
    if (!apiDate) return '';
    try {
      const date = new Date(apiDate);
      // Convert to local datetime-local format (YYYY-MM-DDTHH:MM)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (error) {
      return '';
    }
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
    updatedAssets[assetIndex] = { ...updatedAssets[assetIndex], workshopDisplayName: newDisplayName };
    
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
    updatedAssets[assetIndex] = { ...updatedAssets[assetIndex], workshopDescription: newDescription };
    
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
    
    // Navigate back to the list page
    const currentNamespace = namespace || userNamespace?.name;
    navigate(currentNamespace ? `/event-wizard/${currentNamespace}` : '/event-wizard');
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

  function showDeleteAssetModal(index: number, asset: any): void {
    setAssetToDelete({ index, asset });
    openModalDeleteAsset();
  }



  async function onAddWorkshopsConfirm(): Promise<void> {
    if (!multiworkshop || !workshops || selectedWorkshops.length === 0) return;
    
    try {
      // Create new assets from selected workshops
      const newAssets = selectedWorkshops.map(workshopName => {
        const workshop = workshops.find(w => w.metadata.name === workshopName);
        return {
          key: workshopName, // Use workshop name as key
          assetNamespace: namespace!, // Same namespace as MultiWorkshop
          workshopDisplayName: workshop?.spec?.displayName || workshopName,
          workshopDescription: workshop?.spec?.description || '',
          workshopName: workshopName,
          type: 'catalog' as const,
        };
      });

      // Combine existing assets with new ones
      const existingAssets = multiworkshop.spec.assets || [];
      const combinedAssets = [...existingAssets, ...newAssets];

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
      
      // Clear selection and close modal
      setSelectedWorkshops([]);
    } catch (error) {
      console.error('Failed to add workshops:', error);
      // You might want to show an error message here
    }
  }

  async function onAddExternalWorkshopConfirm(data: { url: string; workshopDisplayName: string; workshopDescription: string }): Promise<void> {
    if (!multiworkshop) return;
    
    try {
      // Create new external asset
      const newExternalAsset = {
        key: `external-${Date.now()}`, // Generate unique key for external workshop
        url: data.url,
        workshopDisplayName: data.workshopDisplayName,
        workshopDescription: data.workshopDescription,
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

  // Get available workshops (exclude already added ones and those being deleted)
  const availableWorkshops = workshops?.filter(workshop => {
    // Filter out workshops that are being deleted
    if (workshop.metadata.deletionTimestamp) {
      return false;
    }
    
    const existingWorkshopNames = multiworkshop?.spec.assets?.map(asset => asset.workshopName).filter(Boolean) || [];
    return !existingWorkshopNames.includes(workshop.metadata.name);
  }) || [];

  // Filter workshops by search value
  const filteredAvailableWorkshops = availableWorkshops.filter(workshop => {
    if (!workshopSearchValue.trim()) return true;
    const searchLower = workshopSearchValue.toLowerCase();
    const displayName = workshop.spec?.displayName || workshop.metadata.name;
    return (
      displayName.toLowerCase().includes(searchLower) ||
      workshop.metadata.name.toLowerCase().includes(searchLower) ||
      (workshop.spec?.description && workshop.spec.description.toLowerCase().includes(searchLower))
    );
  });

  if (error) {
    return (
      <PageSection>
        <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="Error loading event" variant="full">
          <EmptyStateBody>
            {error.status === 404 ? 
              'The requested event was not found.' : 
              'An error occurred while loading the event details.'
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
        title={`Delete event ${getMultiWorkshopDisplayName(multiworkshop)}?`}
      >
        <p>This action cannot be undone. All associated workshop data will be deleted.</p>
      </Modal>

      <Modal
        ref={modalDeleteAsset}
        onConfirm={onDeleteAssetConfirm}
        title={`Delete asset "${assetToDelete?.asset?.workshopDisplayName || assetToDelete?.asset?.key || 'Unknown'}"?`}
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
        variant={ModalVariant.large}
        onClose={() => {
          setSelectedWorkshops([]);
          setWorkshopSearchValue('');
        }}
      >
        <div>
          <p style={{ marginBottom: '16px' }}>
            Select existing workshops from your namespace to add to this event.
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
                {availableWorkshops.length === 0 
                  ? "No workshops available to add. All existing workshops in this namespace may already be included."
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
                  <Th width={15}>Created</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredAvailableWorkshops.map((workshop) => {
                  const handleSelectionToggle = () => {
                    const isSelected = selectedWorkshops.includes(workshop.metadata.name);
                    if (isSelected) {
                      setSelectedWorkshops(prev => prev.filter(name => name !== workshop.metadata.name));
                    } else {
                      setSelectedWorkshops(prev => [...prev, workshop.metadata.name]);
                    }
                  };

                  return (
                    <Tr 
                      key={workshop.metadata.name}
                      isSelectable
                      isRowSelected={selectedWorkshops.includes(workshop.metadata.name)}
                    >
                      <Td>
                        <Checkbox
                          id={`workshop-${workshop.metadata.name}`}
                          isChecked={selectedWorkshops.includes(workshop.metadata.name)}
                          onChange={handleSelectionToggle}
                        />
                      </Td>
                      <Td onClick={handleSelectionToggle} style={{ cursor: 'pointer' }}>
                        <strong>{workshop.spec?.displayName || workshop.metadata.name}</strong>
                      </Td>
                      <Td onClick={handleSelectionToggle} style={{ cursor: 'pointer' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '14px' }}>
                          {workshop.metadata.name}
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
              onClick={() => navigate(currentNamespace ? `/event-wizard/${currentNamespace}` : '/event-wizard')}
            >
              Event Wizard
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{getMultiWorkshopDisplayName(multiworkshop)}</BreadcrumbItem>
        </Breadcrumb>
        
        <Split hasGutter className="multiworkshop-detail__header">
          <SplitItem isFilled>
            <Title headingLevel="h1" size="2xl" style={{ display: 'flex', alignItems: 'center' }}>
              {multiworkshop.metadata.name}
              <Label key="event-wizard-label" tooltipDescription={<div>Event Wizard interface</div>}>
                Event Wizard
              </Label>
            </Title>
          </SplitItem>
          <SplitItem>
            <ButtonCircleIcon
              onClick={openModalDelete}
              description="Delete Event"
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
                <DescriptionList isHorizontal>
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
                    <span style={{ fontFamily: 'monospace', fontSize: '14px', marginRight: '8px' }}>
                      {multiworkshop.metadata.name}
                    </span>
                    <OpenshiftConsoleLink resource={multiworkshop} />
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Description</DescriptionListTerm>
                  <DescriptionListDescription>
                    <EditableText
                      value={multiworkshop.spec.description || ''}
                      onChange={updateEventDescription}
                      placeholder="Event description"
                      componentType="TextArea"
                    />
                  </DescriptionListDescription>
                </DescriptionListGroup>
                
                <DescriptionListGroup>
                  <DescriptionListTerm>Portal URL</DescriptionListTerm>
                  <DescriptionListDescription>
                    <Link 
                      to={`/multiworkshops/${multiworkshop.metadata.namespace}/${multiworkshop.metadata.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontFamily: 'monospace', fontSize: '14px' }}
                    >
                      {`${window.location.origin}/multiworkshops/${multiworkshop.metadata.namespace}/${multiworkshop.metadata.name}`}
                    </Link>
                  </DescriptionListDescription>
                </DescriptionListGroup>



                <DescriptionListGroup>
                  <DescriptionListTerm>Created</DescriptionListTerm>
                  <DescriptionListDescription>
                    <TimeInterval toTimestamp={multiworkshop.metadata.creationTimestamp} />
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
                      placeholder="Background image URL"
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
                      placeholder="Logo image URL"
                    />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>

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
                      <Button 
                        variant="primary" 
                        onClick={openModalAddWorkshop}
                        isDisabled={availableWorkshops.length === 0}
                      >
                        Add Workshop
                      </Button>
                      <Button 
                        variant="secondary" 
                        onClick={openModalExternalWorkshop}
                      >
                        Add External Workshop
                      </Button>
                    </div>
                  </SplitItem>
                </Split>
                
                {multiworkshop.spec.assets && multiworkshop.spec.assets.length > 0 ? (
                  <Table aria-label="Workshop assets" variant="compact">
                    <Thead>
                      <Tr>
                        <Th>Workshop Name</Th>
                        <Th>Display Name</Th>
                        <Th>Description</Th>
                        <Th>Status</Th>
                        <Th>Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {multiworkshop.spec.assets.map((asset, index) => (
                        <Tr key={index}>
                          <Td>
                            {asset.type === 'external' ? (
                              <a 
                                href={asset.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ textDecoration: 'none', color: 'var(--pf-t--color--link--default)' }}
                              >
                                {asset.workshopDisplayName || asset.key}
                              </a>
                            ) : asset.workshopName ? (
                              <Link 
                                to={`/workshops/${multiworkshop.metadata.namespace}/${asset.workshopName}`}
                                style={{ textDecoration: 'none' }}
                              >
                                {asset.workshopName}
                              </Link>
                            ) : (
                              <span style={{ color: 'var(--pf-t--color--text--secondary)', fontStyle: 'italic' }}>
                                Not created yet
                              </span>
                            )}
                          </Td>
                          <Td>
                            <EditableText
                              value={asset.workshopDisplayName || ''}
                              onChange={(value) => updateAssetDisplayName(index, value)}
                              placeholder="Workshop display name"
                            />
                          </Td>
                          <Td>
                            <EditableText
                              value={asset.workshopDescription || ''}
                              onChange={(value) => updateAssetDescription(index, value)}
                              componentType="TextArea"
                            />
                          </Td>
                          <Td>
                            {asset.type === 'external' ? (
                              <span>External</span>
                            ) : asset.workshopName ? (
                              <span>Created</span>
                            ) : (
                              <span>Pending</span>
                            )}
                          </Td>
                          <Td>
                            <ButtonCircleIcon
                              onClick={() => showDeleteAssetModal(index, asset)}
                              description="Delete asset"
                              icon={TrashIcon}
                            />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
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
          <Tab eventKey="provisioning" title={<TabTitleText>Default Provisioning Settings</TabTitleText>}>
            {activeTab === 'provisioning' ? (
              <DescriptionList isHorizontal className="multiworkshop-detail__provisioning">
                <DescriptionListGroup>
                  <DescriptionListTerm>Number of Seats</DescriptionListTerm>
                  <DescriptionListDescription>
                    <div>
                      <NumberInput
                        value={multiworkshop.spec.numberSeats || 1}
                        onMinus={async () => {
                          const newValue = Math.max(1, (multiworkshop.spec.numberSeats || 1) - 1);
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { spec: { numberSeats: newValue } },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                        }}
                        onPlus={async () => {
                          const newValue = (multiworkshop.spec.numberSeats || 1) + 1;
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { spec: { numberSeats: newValue } },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                        }}
                        onChange={async (event) => {
                          const value = parseInt((event.target as HTMLInputElement).value) || 1;
                          const newValue = Math.max(1, value);
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { spec: { numberSeats: newValue } },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                        }}
                        min={1}
                        widthChars={10}
                      />
                    </div>
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Start provisioning date</DescriptionListTerm>
                  <DescriptionListDescription>
                    <div style={{ maxWidth: '300px' }}>
                      <TextInput
                        type="datetime-local"
                        value={apiDateToLocalDateTime(multiworkshop.spec.startDate || '')}
                        onChange={async (_, value) => {
                          const apiDate = value ? dateToApiString(new Date(value)) : '';
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { spec: { startDate: apiDate } },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                        }}
                      />
                    </div>
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>End Date</DescriptionListTerm>
                  <DescriptionListDescription>
                    <div style={{ maxWidth: '300px' }}>
                      <TextInput
                        type="datetime-local"
                        value={apiDateToLocalDateTime(multiworkshop.spec.endDate || '')}
                        onChange={async (_, value) => {
                          const apiDate = value ? dateToApiString(new Date(value)) : '';
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { spec: { endDate: apiDate } },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                        }}
                      />
                    </div>
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Activity & Purpose</DescriptionListTerm>
                  <DescriptionListDescription>
                    <div style={{ maxWidth: '400px' }}>
                      <ActivityPurposeSelector
                        value={{
                          activity: multiworkshop.spec['purpose-activity'] || '',
                          purpose: multiworkshop.spec.purpose || '',
                        }}
                        purposeOpts={purposeOptions}
                        onChange={async (activity, purpose, explanation) => {
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { 
                              spec: { 
                                'purpose-activity': activity,
                                purpose: purpose,
                              } 
                            },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                        }}
                      />
                    </div>
                  </DescriptionListDescription>
                </DescriptionListGroup>
                
                <DescriptionListGroup>
                  <DescriptionListTerm>Salesforce ID</DescriptionListTerm>
                  <DescriptionListDescription>
                    <div style={{ maxWidth: '400px' }}>
                      <SalesforceIdField
                        value={multiworkshop.spec.salesforceId || ''}
                        onChange={async (value) => {
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { spec: { salesforceId: value } },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                        }}
                        salesforceType={multiworkshop.spec.salesforceType || null}
                        onTypeChange={async (type) => {
                          const updatedMultiWorkshop = await patchMultiWorkshop({
                            name: multiworkshop.metadata.name,
                            namespace: multiworkshop.metadata.namespace,
                            patch: { spec: { salesforceType: type } },
                          });
                          mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), updatedMultiWorkshop, false);
                        }}
                        fieldId="multiworkshop-salesforce-id"
                        label=""
                      />
                    </div>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
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
    </div>
  );
};

export default MultiWorkshopDetail;
