import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import useSession from '@app/utils/useSession';
import {
  PageSection,
  Title,
  Button,
  Form,
  FormGroup,
  TextInput,
  NumberInput,
  TextArea,
  Split,
  SplitItem,
  Card,
  CardBody,
  ActionGroup,
  Breadcrumb,
  BreadcrumbItem,
  Alert,
} from '@patternfly/react-core';
import PlusIcon from '@patternfly/react-icons/dist/js/icons/plus-icon';
import { createMultiWorkshop, dateToApiString, createWorkshopFromAsset, createWorkshopFromAssetWithRetry, createWorkshopProvisionFromAsset, patchMultiWorkshop, fetcher, apiPaths } from '@app/api';
import { CatalogItem, SfdcType, TPurposeOpts, ServiceNamespace, ResourceClaim, Nullable } from '@app/types';
import { compareK8sObjectsArr, displayName, FETCH_BATCH_LIMIT, isResourceClaimPartOfWorkshop } from '@app/util';
import CatalogItemSelectorModal from './CatalogItemSelectorModal';
import SalesforceIdField from './SalesforceIdField';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import ProjectSelector from '@app/components/ProjectSelector';
import purposeOptions from './purposeOptions.json';

import './multiworkshop-create.css';


export async function fetcherItemsInAllPages(pathFn: (continueId: string) => string, opts?: Record<string, unknown>) {
  const items = [];
  let continueId: Nullable<string> = null;
  while (continueId || continueId === null) {
    const res: { metadata: { continue: string }; items: unknown[] } = await fetcher(pathFn(continueId), opts);
    continueId = res.metadata.continue || '';
    items.push(...res.items);
  }
  return items;
}

const MultiWorkshopCreate: React.FC = () => {
  const navigate = useNavigate();
  const { userNamespace, isAdmin, serviceNamespaces } = useSession().getSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCatalogSelectorOpen, setIsCatalogSelectorOpen] = useState(false);
  const [currentAssetIndex, setCurrentAssetIndex] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<ServiceNamespace>(userNamespace);
  const [createFormData, setCreateFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    numberSeats: 10,
    salesforceId: '',
    salesforceType: null as SfdcType | null,
    activity: '',
    purpose: '',
    explanation: '',
    backgroundImage: '',
    logoImage: '',
    assets: [{ key: '', assetNamespace: '', workshopDisplayName: '', workshopDescription: '', type: 'catalog' as 'catalog' | 'external' }]
  });

  // Fetch user's existing services for quota check
  const { data: userResourceClaims } = useSWR<ResourceClaim[]>(
    selectedNamespace?.name
      ? apiPaths.RESOURCE_CLAIMS({
          namespace: selectedNamespace.name,
          limit: 'ALL',
        })
      : null,
      () => fetcherItemsInAllPages((continueId) =>
        apiPaths.RESOURCE_CLAIMS({
          namespace: selectedNamespace.name,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        }),
        {
          refreshInterval: 8000,
          compare: compareK8sObjectsArr,
        },  
      ),
  );

  // Calculate current active services (excluding deleted ones and workshop-related ones)
  const currentServices: ResourceClaim[] = useMemo(
    () =>
      Array.isArray(userResourceClaims)
        ? [].concat(...userResourceClaims.filter((r) => !isResourceClaimPartOfWorkshop(r) && !r.metadata.deletionTimestamp))
        : [],
    [userResourceClaims],
  );

  // Calculate how many catalog assets will be created (each counts as 1 service)
  const catalogAssetsCount = useMemo(() => {
    return createFormData.assets.filter(asset => 
      asset.type !== 'external' && 
      asset.key.trim() !== '' && 
      asset.assetNamespace.trim() !== ''
    ).length;
  }, [createFormData.assets]);

  const wouldExceedQuota = useMemo(() => {
    if (isAdmin) return false;
    return (currentServices.length + catalogAssetsCount) > 5;
  }, [currentServices.length, catalogAssetsCount, isAdmin]);

  const isFormValid = createFormData.name && 
                      createFormData.startDate && 
                      createFormData.endDate &&
                      createFormData.activity &&
                      createFormData.purpose &&
                      (isAdmin || (createFormData.salesforceId && createFormData.salesforceType)) &&
                      !wouldExceedQuota;

  async function onCreateMultiWorkshop(): Promise<void> {
    if (!isFormValid) return;
    
    setIsSubmitting(true);
    try {
      // Filter out empty assets and include key, assetNamespace, workshopDisplayName, and workshopDescription fields
      const filteredAssets = createFormData.assets
        .filter(asset => asset.key.trim() !== '' && asset.assetNamespace.trim() !== '')
        .map(asset => ({ 
          key: asset.key.trim(),
          assetNamespace: asset.assetNamespace.trim(),
          ...(asset.workshopDisplayName?.trim() && { workshopDisplayName: asset.workshopDisplayName.trim() }),
          ...(asset.workshopDescription?.trim() && { workshopDescription: asset.workshopDescription.trim() }),
          type: asset.type || 'catalog'
        }));
      
      const payload = {
        name: createFormData.name,
        startDate: dateToApiString(new Date(createFormData.startDate)),
        endDate: dateToApiString(new Date(createFormData.endDate)),
        namespace: selectedNamespace?.name || userNamespace.name,
        ...(createFormData.description && { description: createFormData.description }),
        ...(createFormData.numberSeats && { numberSeats: createFormData.numberSeats }),
        ...(createFormData.salesforceId && { salesforceId: createFormData.salesforceId }),
        ...(createFormData.purpose && { purpose: createFormData.purpose }),
        ...(createFormData.activity && { 'purpose-activity': createFormData.activity }),
        ...(createFormData.backgroundImage && { backgroundImage: createFormData.backgroundImage }),
        ...(createFormData.logoImage && { logoImage: createFormData.logoImage }),
        ...(filteredAssets.length > 0 && { assets: filteredAssets }),
      };

      // Create the MultiWorkshop first
      const createdMultiWorkshop = await createMultiWorkshop(payload);
      
      // If we have catalog assets, create workshops and provisions for them
      const catalogAssets = filteredAssets.filter(asset => !asset.type || asset.type === 'catalog');
      if (catalogAssets.length > 0) {
        // Process catalog assets in parallel with proper error handling
        const assetResults = await Promise.allSettled(
          catalogAssets.map(async (asset, index) => {
            try {
              // Get catalog item to verify it exists and get metadata
              let catalogItem: CatalogItem | undefined;
              try {
                catalogItem = await fetcher(apiPaths.CATALOG_ITEM({ 
                  namespace: asset.assetNamespace, 
                  name: asset.key 
                }));
              } catch (error) {
                console.warn(`Could not fetch catalog item ${asset.key} from namespace ${asset.assetNamespace}:`, error);
                throw new Error(`Catalog item ${asset.key} not found in namespace ${asset.assetNamespace}`);
              }
              
              // Create workshop for this asset with retry logic
              const workshop = await createWorkshopFromAssetWithRetry({
                multiworkshopName: createdMultiWorkshop.metadata.name,
                namespace: createdMultiWorkshop.metadata.namespace,
                asset,
                multiworkshopData: {
                  ...createFormData,
                  name: createFormData.name,
                  startDate: payload.startDate,
                  endDate: payload.endDate,
                },
                catalogItem,
                retryCount: 3,
                delay: index * 100, // Stagger creation to avoid naming conflicts
              });
              
              // Create workshop provision for this asset
              await createWorkshopProvisionFromAsset({
                workshop,
                asset,
                multiworkshopName: createdMultiWorkshop.metadata.name,
                multiworkshopData: {
                  ...createFormData,
                  numberSeats: createFormData.numberSeats,
                  startDate: payload.startDate,
                  endDate: payload.endDate,
                },
                catalogItem,
              });
              
              // Return updated asset with workshop name
              return {
                success: true,
                asset: {
                  ...asset,
                  workshopName: workshop.metadata.name,
                },
                error: null,
              };
              
            } catch (error: any) {
              console.error(`Failed to create workshop for asset ${asset.key}:`, error);
              return {
                success: false,
                asset: asset,
                error: error?.message || 'Unknown error',
              };
            }
          })
        );
        
        // Collect results and separate successful from failed
        const updatedAssets = [];
        const failedAssets = [];
        
        assetResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              updatedAssets.push(result.value.asset);
            } else {
              failedAssets.push({
                asset: result.value.asset,
                error: result.value.error,
              });
              // Add asset without workshop name
              updatedAssets.push(result.value.asset);
            }
          } else {
            console.error(`Promise rejected for asset ${catalogAssets[index].key}:`, result.reason);
            failedAssets.push({
              asset: catalogAssets[index],
              error: result.reason?.message || 'Promise rejected',
            });
            // Add asset without workshop name
            updatedAssets.push(catalogAssets[index]);
          }
        });
        
        // Include external assets unchanged
        const externalAssets = filteredAssets.filter(asset => asset.type === 'external');
        updatedAssets.push(...externalAssets);
        
        // Update the MultiWorkshop with workshop information
        try {
          await patchMultiWorkshop({
            name: createdMultiWorkshop.metadata.name,
            namespace: createdMultiWorkshop.metadata.namespace,
            patch: {
              spec: {
                assets: updatedAssets,
              },
            },
          });
        } catch (error) {
          console.error('Failed to update MultiWorkshop with workshop information:', error);
        }
        
        // Log summary of results
        if (failedAssets.length > 0) {
          console.warn(`Failed to create workshops for ${failedAssets.length} assets:`, 
            failedAssets.map(f => `${f.asset.key}: ${f.error}`).join(', ')
          );
        }
        console.log(`Successfully created ${updatedAssets.filter(a => a.workshopName).length} workshops out of ${catalogAssets.length} catalog assets`);
      }

      // Navigate to the created multiworkshop detail page
      navigate(`/event-wizard/${createdMultiWorkshop.metadata.namespace}/${createdMultiWorkshop.metadata.name}`);
    } catch (error) {
      console.error('Error creating MultiWorkshop:', error);
      // TODO: Add proper error handling/notification
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateAsset(index: number, field: string, value: string) {
    setCreateFormData(prev => ({
      ...prev,
      assets: prev.assets.map((asset, i) => 
        i === index ? { ...asset, [field]: value } : asset
      )
    }));
  }

  function addAsset() {
    setCreateFormData(prev => ({
      ...prev,
      assets: [...prev.assets, { key: '', assetNamespace: '', workshopDisplayName: '', workshopDescription: '', type: 'catalog' as 'catalog' | 'external' }]
    }));
  }

  function removeAsset(index: number) {
    setCreateFormData(prev => ({
      ...prev,
      assets: prev.assets.filter((_, i) => i !== index)
    }));
  }

  function openCatalogSelector(index: number) {
    setCurrentAssetIndex(index);
    setIsCatalogSelectorOpen(true);
  }

  function handleCatalogItemSelect(catalogItem: CatalogItem) {
    if (currentAssetIndex !== null) {
      const key = catalogItem.metadata.name;  // Just the catalog item name
      const assetNamespace = catalogItem.metadata.namespace;  // Store namespace separately
      const workshopDisplayName = displayName(catalogItem);
      
      setCreateFormData(prev => ({
        ...prev,
        assets: prev.assets.map((asset, i) => 
          i === currentAssetIndex 
            ? { 
                ...asset, 
                key,
                assetNamespace,
                workshopDisplayName: workshopDisplayName,  // Always update with new catalog item's display name
                type: 'catalog' as 'catalog' | 'external'
              } 
            : asset
        )
      }));
    }
    setIsCatalogSelectorOpen(false);
    setCurrentAssetIndex(null);
  }

  function closeCatalogSelector() {
    setIsCatalogSelectorOpen(false);
    setCurrentAssetIndex(null);
  }

  return (
    <div>
      <PageSection variant="default">
        <Breadcrumb>
          <BreadcrumbItem>
            <Button variant="link" onClick={() => navigate(selectedNamespace ? `/event-wizard/${selectedNamespace.name}` : '/event-wizard')}>
              Event Wizard
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>Create Event</BreadcrumbItem>
        </Breadcrumb>
        <Title headingLevel="h1" size="2xl">
          Create Event
        </Title>
      </PageSection>

      <PageSection>
        <Form className="multiworkshop-create__form">
              {(isAdmin || serviceNamespaces.length > 1) && (
                <FormGroup label="Create Event in Project" fieldId="project-selector">
                  <ProjectSelector
                    currentNamespaceName={selectedNamespace?.name}
                    onSelect={(namespace) => setSelectedNamespace(namespace)}
                    isPlain={false}
                    hideLabel={true}
                  />
                </FormGroup>
              )}

              <FormGroup label="Name" isRequired fieldId="name">
                <TextInput
                  isRequired
                  type="text"
                  id="name"
                  name="name"
                  value={createFormData.name}
                  onChange={(_, value) => setCreateFormData(prev => ({ ...prev, name: value }))}
                  placeholder="Enter event name"
                />
              </FormGroup>

              <FormGroup label="Description" fieldId="description">
                <TextArea
                  id="description"
                  name="description"
                  value={createFormData.description}
                  onChange={(_, value) => setCreateFormData(prev => ({ ...prev, description: value }))}
                  placeholder="Enter description (optional)"
                  rows={3}
                />
              </FormGroup>

              <Split hasGutter>
                <SplitItem isFilled>
                  <FormGroup label="Start provisioning date" isRequired fieldId="startDate">
                    <TextInput
                      isRequired
                      type="datetime-local"
                      id="startDate"
                      name="startDate"
                      value={createFormData.startDate}
                      onChange={(_, value) => setCreateFormData(prev => ({ ...prev, startDate: value }))}
                    />
                  </FormGroup>
                </SplitItem>
                <SplitItem isFilled>
                  <FormGroup label="End Date" isRequired fieldId="endDate">
                    <TextInput
                      isRequired
                      type="datetime-local"
                      id="endDate"
                      name="endDate"
                      value={createFormData.endDate}
                      onChange={(_, value) => setCreateFormData(prev => ({ ...prev, endDate: value }))}
                    />
                  </FormGroup>
                </SplitItem>
              </Split>

              <FormGroup label="Number of Seats" fieldId="numberSeats">
                <NumberInput
                  id="numberSeats"
                  value={createFormData.numberSeats}
                  onMinus={() => setCreateFormData(prev => ({ ...prev, numberSeats: Math.max(1, prev.numberSeats - 1) }))}
                  onPlus={() => {
                    const maxSeats = isAdmin ? 200 : 30;
                    setCreateFormData(prev => ({ ...prev, numberSeats: Math.min(maxSeats, prev.numberSeats + 1) }));
                  }}
                  onChange={(event) => {
                    const value = parseInt((event.target as HTMLInputElement).value) || 1;
                    const maxSeats = isAdmin ? 200 : 30;
                    setCreateFormData(prev => ({ ...prev, numberSeats: Math.max(1, Math.min(maxSeats, value)) }));
                  }}
                  min={1}
                  max={isAdmin ? undefined : 30}
                />
                {!isAdmin && (
                  <div style={{ marginTop: '4px', fontSize: '14px', color: 'var(--pf-t--global--text--color--subtle)' }}>
                    Maximum 30 seats allowed
                  </div>
                )}
              </FormGroup>

              <ActivityPurposeSelector
                value={{ 
                  purpose: createFormData.purpose, 
                  activity: createFormData.activity,
                  explanation: createFormData.explanation
                }}
                purposeOpts={purposeOptions as TPurposeOpts}
                onChange={(activity: string, purpose: string, explanation: string) => {
                  setCreateFormData(prev => ({
                    ...prev,
                    activity: activity || '',
                    purpose: purpose || '',
                    explanation: explanation || ''
                  }));
                }}
              />

              <SalesforceIdField
                value={createFormData.salesforceId}
                onChange={(value) => setCreateFormData(prev => ({ ...prev, salesforceId: value }))}
                salesforceType={createFormData.salesforceType}
                onTypeChange={(type) => setCreateFormData(prev => ({ ...prev, salesforceType: type }))}
                fieldId="salesforceId"
                isRequired={!isAdmin}
              />

              <Split hasGutter>
                <SplitItem isFilled>
                  <FormGroup label="Background Image URL" fieldId="backgroundImage">
                    <TextInput
                      id="backgroundImage"
                      name="backgroundImage"
                      value={createFormData.backgroundImage}
                      onChange={(_, value) => setCreateFormData(prev => ({ ...prev, backgroundImage: value }))}
                      placeholder="Optional background image URL"
                    />
                  </FormGroup>
                </SplitItem>
                <SplitItem isFilled>
                  <FormGroup label="Logo Image URL" fieldId="logoImage">
                    <TextInput
                      id="logoImage"
                      name="logoImage"
                      value={createFormData.logoImage}
                      onChange={(_, value) => setCreateFormData(prev => ({ ...prev, logoImage: value }))}
                      placeholder="Optional logo image URL"
                    />
                  </FormGroup>
                </SplitItem>
              </Split>

              <FormGroup label="Assets" fieldId="assets">
                {createFormData.assets.map((asset, index) => (
                                  <Card 
                  key={index} 
                  className="multiworkshop-create__asset-card"
                  style={{ marginBottom: '12px' }}
                >
                    <CardBody>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <Title headingLevel="h4" size="md">Asset {index + 1}</Title>
                        <Button 
                          variant="link" 
                          onClick={() => removeAsset(index)}
                          isDisabled={createFormData.assets.length === 1}
                          size="sm"
                          isDanger
                        >
                          Remove
                        </Button>
                      </div>
                      <FormGroup label="Catalog Item" fieldId={`asset-key-${index}`} style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                          <div style={{ flex: 1 }}>
                            <TextInput
                              id={`asset-key-${index}`}
                              placeholder="Select a catalog item..."
                              value={asset.key && asset.assetNamespace ? `${asset.assetNamespace}.${asset.key}` : ''}
                              readOnly
                              style={{ 
                                backgroundColor: 'var(--pf-t--color--background--disabled)', 
                                cursor: 'pointer' 
                              }}
                              onClick={() => openCatalogSelector(index)}
                            />
                          </div>
                          <Button 
                            variant="secondary" 
                            onClick={() => openCatalogSelector(index)}
                          >
                            {asset.key ? 'Change' : 'Select'}
                          </Button>
                        </div>
                      </FormGroup>
                      <FormGroup label="Workshop Display Name" fieldId={`asset-display-name-${index}`} style={{ marginBottom: '12px' }}>
                        <TextInput
                          placeholder="Optional display name for this workshop (e.g., 'Container Basics')"
                          value={asset.workshopDisplayName}
                          onChange={(_, value) => updateAsset(index, 'workshopDisplayName', value)}
                        />
                      </FormGroup>
                      <FormGroup label="Workshop Description" fieldId={`asset-description-${index}`}>
                        <TextArea
                          id={`asset-description-${index}`}
                          placeholder="Optional description for this workshop"
                          value={asset.workshopDescription}
                          onChange={(_, value) => updateAsset(index, 'workshopDescription', value)}
                          rows={3}
                        />
                      </FormGroup>
                    </CardBody>
                  </Card>
                ))}
                <Button variant="link" onClick={addAsset} icon={<PlusIcon />}>
                  Add Asset
                </Button>
              </FormGroup>

              {wouldExceedQuota && (
                <Alert 
                  variant="warning" 
                  title="Service Quota Exceeded"
                  style={{ marginBottom: '24px' }}
                >
                  <p>
                    You have {currentServices.length} active service{currentServices.length !== 1 ? 's' : ''} and this event would create {catalogAssetsCount} additional service{catalogAssetsCount !== 1 ? 's' : ''}.
                    You cannot exceed the quota of 5 services. Please reduce the number of catalog assets or retire existing services.
                  </p>
                </Alert>
              )}

              <ActionGroup>
                <Button 
                  variant="primary" 
                  onClick={onCreateMultiWorkshop}
                  isDisabled={!isFormValid || isSubmitting}
                  isLoading={isSubmitting}
                >
                  Create Event
                </Button>
                <Button variant="link" onClick={() => navigate(selectedNamespace ? `/event-wizard/${selectedNamespace.name}` : '/event-wizard')}>
                  Cancel
                </Button>
              </ActionGroup>
            </Form>
      </PageSection>

      <CatalogItemSelectorModal
        isOpen={isCatalogSelectorOpen}
        onClose={closeCatalogSelector}
        onSelect={handleCatalogItemSelect}
        title="Select Catalog Item for Workshop"
      />
    </div>
  );
};

export default MultiWorkshopCreate;
