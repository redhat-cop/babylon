import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import useSWRImmutable from 'swr/immutable';
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
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Tooltip,
} from '@patternfly/react-core';
import PlusIcon from '@patternfly/react-icons/dist/js/icons/plus-icon';
import InfoAltIcon from '@patternfly/react-icons/dist/js/icons/info-alt-icon';
import { createMultiWorkshop, dateToApiString, createWorkshopFromAssetWithRetry, createWorkshopProvisionFromAsset, patchMultiWorkshop, fetcher, apiPaths, silentFetcher } from '@app/api';
import { CatalogItem, SfdcType, TPurposeOpts, ServiceNamespace, ResourceClaim, Nullable, AssetMetrics } from '@app/types';
import { compareK8sObjectsArr, displayName, FETCH_BATCH_LIMIT, isResourceClaimPartOfWorkshop } from '@app/util';
import { formatCurrency, formatTime } from '@app/Catalog/catalog-utils';
import CatalogItemSelectorModal from './CatalogItemSelectorModal';
import SalesforceIdField from './SalesforceIdField';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import ProjectSelector from '@app/components/ProjectSelector';
import DateTimePicker from '@app/components/DateTimePicker';
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
  const [createFormData, setCreateFormData] = useState(() => {
    const now = new Date();
    const endDateTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return {
      name: '',
      description: '',
      startDate: now,
      endDate: endDateTime,
      numberSeats: 1,
      salesforceId: '',
      salesforceType: null as SfdcType | null,
      activity: '',
      purpose: '',
      explanation: '',
      backgroundImage: '',
      logoImage: '',
      assets: [{ key: '', name: '', namespace: '', displayName: '', description: '', type: 'Workshop' as 'Workshop' | 'external' }]
    };
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

  // Get catalog items for metrics fetching
  const validAssets = useMemo(() => 
    createFormData.assets.filter(asset => 
      asset.type !== 'external' && 
      asset.key.trim() !== '' && 
      asset.name.trim() !== '' && 
      asset.namespace.trim() !== ''
    ),
    [createFormData.assets],
  );

  // Fetch catalog items to get asset UUIDs
  const catalogItemsQueries = validAssets.map(asset => ({
    key: `catalogItem-${asset.namespace}-${asset.key}`,
    path: apiPaths.CATALOG_ITEM({ namespace: asset.namespace, name: asset.key }),
    shouldFetch: !!asset.namespace && !!asset.key,
  }));

  // Fetch all catalog items
  const catalogItemsData = useSWRImmutable(
    catalogItemsQueries.length > 0 ? catalogItemsQueries : null,
    async (queries) => {
      if (!queries) return [];
      const results = await Promise.allSettled(
        queries.map(query => 
          query.shouldFetch ? silentFetcher(query.path) : Promise.resolve(null)
        )
      );
      return results.map((result, index) => ({
        asset: validAssets[index],
        catalogItem: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason : null,
      }));
    },
    {
      shouldRetryOnError: false,
      suspense: false,
    },
  );

  // Fetch metrics for catalog items that have asset UUIDs
  const metricsData = useSWRImmutable(
    catalogItemsData.data ? 'asset-metrics' : null,
    async () => {
      if (!catalogItemsData.data) return [];
      const metricsPromises = catalogItemsData.data.map(async ({ asset, catalogItem }) => {
        // Skip if catalog item not found
        if (!catalogItem) return { asset, metrics: null, error: 'Catalog item not found' };
        
        // Skip if no asset UUID (catalog item has no metrics)
        const asset_uuid = catalogItem.metadata.labels?.['gpte.redhat.com/asset-uuid'];
        if (!asset_uuid) return { asset, metrics: null, error: null }; // Not an error, just no metrics available
        
        // Try to fetch metrics, silentFetcher returns null for 404 or other errors
        const metrics = await silentFetcher(apiPaths.ASSET_METRICS({ asset_uuid }));
        return { 
          asset, 
          metrics, 
          error: metrics === null ? null : null // silentFetcher already handles errors by returning null
        };
      });
      
      return Promise.all(metricsPromises);
    },
    {
      shouldRetryOnError: false,
      suspense: false,
    },
  );

  // Calculate how many catalog assets will be created (each counts as 1 service)  
  const catalogAssetsCount = validAssets.length;

  // Calculate estimates based on metrics data
  const estimates = useMemo(() => {
    if (!metricsData.data || !catalogItemsData.data) {
      return { 
        totalProvisionTime: null, 
        totalCost: null, 
        itemsWithMetrics: 0, 
        totalItems: validAssets.length 
      };
    }

    let totalProvisionHours = 0;
    let totalHourlyCost = 0;
    let hasProvisionData = false;
    let hasCostData = false;
    let itemsWithMetrics = 0;

    metricsData.data.forEach(({ asset, metrics }, index) => {
      // Only process items that have valid metrics data
      if (!metrics) return;
      itemsWithMetrics++;
      
      if (metrics.medianProvisionHour && metrics.medianProvisionHour > 0) {
        totalProvisionHours = Math.max(totalProvisionHours, metrics.medianProvisionHour * 1.1);
        hasProvisionData = true;
      }
      
      if (metrics.medianLifetimeCostByHour && metrics.medianLifetimeCostByHour > 0) {
        const catalogItemData = catalogItemsData.data[index];
        const catalogItem = catalogItemData?.catalogItem;
        const hourlyCost = metrics.medianLifetimeCostByHour * 1.1;
        
        // For multiuser catalog items, don't multiply by seats (one instance serves all users)
        // For single-user catalog items, multiply by seats (each user needs their own instance)
        const isMultiuser = catalogItem?.spec?.multiuser === true;
        totalHourlyCost += isMultiuser ? hourlyCost : hourlyCost * createFormData.numberSeats;
        hasCostData = true;
      }
    });

    // Calculate total cost based on duration
    let totalEventCost = null;
    if (hasCostData && createFormData.startDate && createFormData.endDate) {
      const durationMs = createFormData.endDate.getTime() - createFormData.startDate.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);
      totalEventCost = totalHourlyCost * durationHours;
    }

    return {
      totalProvisionTime: hasProvisionData ? totalProvisionHours : null,
      totalCost: totalEventCost,
      itemsWithMetrics,
      totalItems: validAssets.length,
    };
  }, [metricsData.data, catalogItemsData.data, createFormData.startDate, createFormData.endDate, createFormData.numberSeats, validAssets.length]);

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
      // Filter out empty assets and include key, name, namespace, displayName, and description fields
      const filteredAssets = createFormData.assets
        .filter(asset => asset.key.trim() !== '' && asset.name.trim() !== '' && asset.namespace.trim() !== '')
        .map(asset => ({ 
          key: asset.key.trim(),
          name: asset.name.trim(),
          namespace: asset.namespace.trim(),
          ...(asset.displayName?.trim() && { displayName: asset.displayName.trim() }),
          ...(asset.description?.trim() && { description: asset.description.trim() }),
          type: asset.type || 'Workshop'
        }));
      
      const payload = {
        name: createFormData.name,
        startDate: dateToApiString(createFormData.startDate),
        endDate: dateToApiString(createFormData.endDate),
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
      const catalogAssets = filteredAssets.filter(asset => !asset.type || asset.type === 'Workshop');
      if (catalogAssets.length > 0) {
        // Process catalog assets in parallel with proper error handling
        const assetResults = await Promise.allSettled(
          catalogAssets.map(async (asset, index) => {
            try {
              // Get catalog item to verify it exists and get metadata
              let catalogItem: CatalogItem | undefined;
              try {
                catalogItem = await fetcher(apiPaths.CATALOG_ITEM({ 
                  namespace: asset.namespace, 
                  name: asset.key 
                }));
              } catch (error) {
                console.warn(`Could not fetch catalog item ${asset.key} from namespace ${asset.namespace}:`, error);
                throw new Error(`Catalog item ${asset.key} not found in namespace ${asset.namespace}`);
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
                  name: workshop.metadata.name, // Update name to the actual generated workshop name
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
      assets: [...prev.assets, { key: '', name: '', namespace: '', displayName: '', description: '', type: 'Workshop' as 'Workshop' | 'external' }]
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
      const namespace = catalogItem.metadata.namespace;  // Store namespace separately
      const workshopDisplayName = displayName(catalogItem);
      
      setCreateFormData(prev => ({
        ...prev,
        assets: prev.assets.map((asset, i) => 
          i === currentAssetIndex 
            ? { 
                ...asset, 
                key,
                name: key, // Set name to the same value as key for catalog items
                namespace,
                displayName: workshopDisplayName,  // Always update with new catalog item's display name
                type: 'Workshop' as 'Workshop' | 'external'
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
                  <FormGroup label="Start provisioning workshops" isRequired fieldId="startDate">
                    <DateTimePicker
                      key="start-date"
                      defaultTimestamp={createFormData.startDate.getTime()}
                      onSelect={(date: Date) => {
                        setCreateFormData(prev => {
                          // Auto-set endDate to 24 hours after startDate
                          const endDateTime = new Date(date.getTime() + 24 * 60 * 60 * 1000);
                          return {
                            ...prev,
                            startDate: date,
                            endDate: endDateTime,
                          };
                        });
                      }}
                    />
                    <div style={{ marginTop: '4px', fontSize: '14px', color: 'var(--pf-t--global--text--color--subtle)' }}>
                      Date and time are based on your device's timezone
                    </div>
                  </FormGroup>
                </SplitItem>
                <SplitItem isFilled>
                  <FormGroup label="Auto-destroy workshops" isRequired fieldId="endDate">
                    <DateTimePicker
                      key="end-date"
                      defaultTimestamp={createFormData.endDate.getTime()}
                      minDate={createFormData.startDate.getTime()}
                      onSelect={(date: Date) => {
                        setCreateFormData(prev => ({ ...prev, endDate: date }));
                      }}
                      forceUpdateTimestamp={createFormData.endDate?.getTime()}
                    />
                    <div style={{ marginTop: '4px', fontSize: '14px', color: 'var(--pf-t--global--text--color--subtle)' }}>
                      Date and time are based on your device's timezone
                    </div>
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
                              value={asset.key && asset.namespace ? `${asset.namespace}.${asset.key}` : ''}
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
                          value={asset.displayName}
                          onChange={(_, value) => updateAsset(index, 'displayName', value)}
                        />
                      </FormGroup>
                      <FormGroup label="Workshop Description" fieldId={`asset-description-${index}`}>
                        <TextArea
                          id={`asset-description-${index}`}
                          placeholder="Optional description for this workshop"
                          value={asset.description}
                          onChange={(_, value) => updateAsset(index, 'description', value)}
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

              {/* Cost and Time Estimates */}
              {validAssets.length > 0 && (estimates.totalProvisionTime !== null || estimates.totalCost !== null || estimates.itemsWithMetrics < estimates.totalItems) && (
                <Card style={{ marginBottom: '24px' }}>
                  <CardBody>
                    <Title headingLevel="h3" size="md" style={{ marginBottom: '16px' }}>
                      Event Estimates
                    </Title>
                    <DescriptionList isHorizontal>
                      {estimates.totalProvisionTime !== null && (
                        <DescriptionListGroup>
                          <DescriptionListTerm>
                            Estimated Provision Time
                            <Tooltip content="Maximum estimated time for all workshops to be provisioned simultaneously.">
                              <InfoAltIcon
                                style={{
                                  paddingTop: "var(--pf-t--global--spacer--xs)",
                                  marginLeft: "var(--pf-t--global--spacer--xs)",
                                  width: "var(--pf-t--global--icon--size--font--xs)",
                                }}
                              />
                            </Tooltip>
                          </DescriptionListTerm>
                          <DescriptionListDescription>
                            {`±${formatTime(`${estimates.totalProvisionTime * 60}m`)}`}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      )}
                      {estimates.totalCost !== null && (
                        <DescriptionListGroup>
                          <DescriptionListTerm>
                            Estimated Total Cost
                            <Tooltip content="Estimated cost over the event duration if not stopped.">
                              <InfoAltIcon
                                style={{
                                  paddingTop: "var(--pf-t--global--spacer--xs)",
                                  marginLeft: "var(--pf-t--global--spacer--xs)",
                                  width: "var(--pf-t--global--icon--size--font--xs)",
                                }}
                              />
                            </Tooltip>
                          </DescriptionListTerm>
                          <DescriptionListDescription>
                            {formatCurrency(estimates.totalCost)}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      )}
                    </DescriptionList>
                    {estimates.itemsWithMetrics < estimates.totalItems && (
                      <div style={{ marginTop: '12px', fontSize: '14px', color: 'var(--pf-t--global--text--color--subtle)' }}>
                        <InfoAltIcon style={{ marginRight: '8px', width: '14px' }} />
                        Estimates shown for {estimates.itemsWithMetrics} of {estimates.totalItems} catalog items. 
                        Some items may not have historical data available yet.
                      </div>
                    )}
                  </CardBody>
                </Card>
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
