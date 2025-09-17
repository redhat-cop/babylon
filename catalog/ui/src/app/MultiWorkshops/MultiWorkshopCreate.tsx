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
  Switch,
} from '@patternfly/react-core';
import PlusIcon from '@patternfly/react-icons/dist/js/icons/plus-icon';
import InfoAltIcon from '@patternfly/react-icons/dist/js/icons/info-alt-icon';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import BetaBadge from '@app/components/BetaBadge';
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
  const [useDirectProvisioningDate, setUseDirectProvisioningDate] = useState(false);
  const [createFormData, setCreateFormData] = useState(() => {
    const now = new Date();
    // Default start date is current time (for actual workshop start)
    // Provisioning will be 8 hours before this
    const defaultProvisioningDate = new Date(now.getTime() - 8 * 60 * 60 * 1000); 
    const endDateTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h after actual start

    return {
      name: '',
      description: '',
      startDate: defaultProvisioningDate, // This is actually the provisioning date
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

  // Create a stable key for catalog items fetching
  const catalogItemsKey = useMemo(() => {
    if (validAssets.length === 0) return null;
    return `catalogItems-${validAssets.map(asset => `${asset.namespace}.${asset.key}`).sort().join('|')}`;
  }, [validAssets]);

  // Fetch all catalog items
  const catalogItemsData = useSWRImmutable(
    catalogItemsKey,
    async () => {
      if (!validAssets.length) return [];
      const results = await Promise.allSettled(
        validAssets.map(asset => 
          silentFetcher(apiPaths.CATALOG_ITEM({ namespace: asset.namespace, name: asset.key }))
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

  // Create a stable key for metrics fetching based on asset UUIDs
  const metricsKey = useMemo(() => {
    if (!catalogItemsData.data) return null;
    const assetUuids = catalogItemsData.data
      .map(({ catalogItem }) => catalogItem?.metadata.labels?.['gpte.redhat.com/asset-uuid'])
      .filter(Boolean)
      .sort();
    if (assetUuids.length === 0) return null;
    return `asset-metrics-${assetUuids.join('|')}`;
  }, [catalogItemsData.data]);

  // Fetch metrics for catalog items that have asset UUIDs
  const metricsData = useSWRImmutable(
    metricsKey,
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
      }

      // Navigate to the created multiworkshop detail page
      navigate(`/multi-workshop/${createdMultiWorkshop.metadata.namespace}/${createdMultiWorkshop.metadata.name}`);
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

  function handleCatalogItemSelect(catalogItemOrItems: CatalogItem | CatalogItem[]) {
    // Handle multi-select (array of catalog items)
    if (Array.isArray(catalogItemOrItems)) {
      const newAssets = catalogItemOrItems.map(catalogItem => ({
        key: catalogItem.metadata.name,
        name: catalogItem.metadata.name,
        namespace: catalogItem.metadata.namespace,
        displayName: displayName(catalogItem),
        description: '',
        type: 'Workshop' as 'Workshop' | 'external'
      }));

      setCreateFormData(prev => {
        // Filter out empty assets and add the new selected ones
        const nonEmptyAssets = prev.assets.filter(asset => 
          asset.key.trim() !== '' || asset.name.trim() !== '' || asset.namespace.trim() !== ''
        );
        return {
          ...prev,
          assets: [...nonEmptyAssets, ...newAssets]
        };
      });
    } 
    // Handle single select (single catalog item)
    else if (currentAssetIndex !== null) {
      const catalogItem = catalogItemOrItems;
      const key = catalogItem.metadata.name;
      const namespace = catalogItem.metadata.namespace;
      const workshopDisplayName = displayName(catalogItem);
      
      setCreateFormData(prev => ({
        ...prev,
        assets: prev.assets.map((asset, i) => 
          i === currentAssetIndex 
            ? { 
                ...asset, 
                key,
                name: key,
                namespace,
                displayName: workshopDisplayName,
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
            <Button variant="link" onClick={() => navigate(selectedNamespace ? `/multi-workshop/${selectedNamespace.name}` : '/multi-workshop')}>
              Multi Workshop
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>Create Multi Workshop</BreadcrumbItem>
        </Breadcrumb>
        <Title headingLevel="h1" size="2xl">
          Create Multi Workshop
        </Title>
        
        {/* Informational Banner */}
        <Alert 
          variant="info" 
          title="Multi Workshop - Multi-Catalog Item Events"
          style={{ marginTop: '16px' }}
        >
          <p>
            This tool is designed for creating events that use <strong>multiple catalog items</strong>. 
            If your event only uses one catalog item, please go through the normal catalog ordering process instead.
          </p>
          <p style={{ marginTop: '8px' }}>
            If you need assistance or our workshop white glove service, please{' '}
            <a href="https://red.ht/workshop-help" target="_blank" rel="noopener noreferrer">
              raise a ticket with our team
            </a>{' '}
            or reach out via the{' '}
            <a href="https://app.slack.com/client/E030G10V24F/C04N203SNUW" target="_blank" rel="noopener noreferrer">
              Slack forum
            </a>.
          </p>
        </Alert>
      </PageSection>

      <PageSection>
        <Form className="multiworkshop-create__form">
              {(isAdmin || serviceNamespaces.length > 1) && (
                <FormGroup label="Create Multi Workshop in Project" fieldId="project-selector">
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

              {/* Workshop Dates - Provisioning Date first, then Ready by */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--pf-t--global--spacer--lg)' }}>
                {/* Provisioning Date */}
                <FormGroup 
                  fieldId="provisioningDate" 
                  isRequired 
                  label="Provisioning Start Date"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pf-t--global--spacer--sm)' }}>
                    <DateTimePicker
                      key={`provisioning-${useDirectProvisioningDate}`}
                      defaultTimestamp={createFormData.startDate?.getTime() || Date.now()}
                      forceUpdateTimestamp={createFormData.startDate?.getTime()}
                      isDisabled={useDirectProvisioningDate}
                      onSelect={(d: Date) => {
                        setCreateFormData(prev => {
                          const actualStartDate = new Date(d.getTime() + 8 * 60 * 60 * 1000); // Actual start is 8 hours after provisioning
                          const endDateTime = new Date(actualStartDate.getTime() + 24 * 60 * 60 * 1000);
                          return {
                            ...prev,
                            startDate: d, // Direct provisioning date control
                            endDate: endDateTime,
                          };
                        });
                      }}
                      minDate={Date.now()}
                    />
                    <Tooltip
                      position="right"
                      content={
                        <p>
                          Select when you want the workshop provisioning to start.
                        </p>
                      }
                    >
                      <OutlinedQuestionCircleIcon
                        aria-label="Select when you want the workshop provisioning to start."
                        className="tooltip-icon-only"
                      />
                    </Tooltip>
                  </div>
                  
                  {/* Provisioning Mode Switch */}
                  <div style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
                    <Switch
                      id="provisioning-mode-switch"
                      aria-label="Set ready by date"
                      label="Set ready by date"
                      isChecked={useDirectProvisioningDate}
                      hasCheckIcon
                      onChange={(_event, isChecked) => {
                        setUseDirectProvisioningDate(isChecked);
                      }}
                    />
                    <Tooltip
                      position="right"
                      content={
                        <p>
                          When enabled, allows you to specify when the workshop should be ready by (8 hours after provisioning starts).
                        </p>
                      }
                    >
                      <OutlinedQuestionCircleIcon
                        aria-label="When enabled, allows you to specify when the workshop should be ready by."
                        className="tooltip-icon-only"
                      />
                    </Tooltip>
                  </div>
                </FormGroup>

                {/* Ready by Date - Only show when switch is enabled */}
                {useDirectProvisioningDate && (
                  <FormGroup 
                    fieldId="readyByDate" 
                    label={
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        Ready by
                        <BetaBadge />
                      </div>
                    }
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pf-t--global--spacer--sm)' }}>
                      <DateTimePicker
                        key={`ready-by-${useDirectProvisioningDate}`}
                        defaultTimestamp={
                          createFormData.startDate
                            ? createFormData.startDate.getTime() + 8 * 60 * 60 * 1000 // Show actual start date (8 hours after provisioning)
                            : Date.now() + 8 * 60 * 60 * 1000
                        }
                        forceUpdateTimestamp={createFormData.startDate?.getTime() + 8 * 60 * 60 * 1000}
                        onSelect={(d: Date) => {
                          // Calculate provisioning date as 8 hours BEFORE ready by date
                          const provisioningDate = new Date(d.getTime() - 8 * 60 * 60 * 1000);
                          setCreateFormData(prev => {
                            const endDateTime = new Date(d.getTime() + 24 * 60 * 60 * 1000); // End date based on ready by date
                            return {
                              ...prev,
                              startDate: provisioningDate, // Internal API uses provisioning date as startDate
                              endDate: endDateTime,
                            };
                          });
                        }}
                        minDate={Date.now() + 8 * 60 * 60 * 1000} // Minimum must account for 8-hour provisioning lead time
                      />
                      <Tooltip
                        position="right"
                        content={
                          <p>
                            Select when you'd like the workshop to be ready. Provisioning will automatically begin 8 hours before this time.
                          </p>
                        }
                      >
                        <OutlinedQuestionCircleIcon
                          aria-label="Select when you'd like the workshop to be ready. Provisioning will automatically begin 8 hours before this time."
                          className="tooltip-icon-only"
                        />
                      </Tooltip>
                    </div>
                  </FormGroup>
                )}
              </div>

              <Split hasGutter>
                <SplitItem isFilled>
                  <FormGroup label="Auto-destroy workshops" isRequired fieldId="endDate">
                    <DateTimePicker
                      key="end-date"
                      defaultTimestamp={createFormData.endDate.getTime()}
                      minDate={useDirectProvisioningDate 
                        ? createFormData.startDate.getTime() + 8 * 60 * 60 * 1000 // Min date is ready by date
                        : createFormData.startDate.getTime() + 8 * 60 * 60 * 1000 // Min date is 8 hours after provisioning
                      }
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
                    Maximum 30 seats allowed.{' '}
                    <a 
                      href="https://red.ht/workshop-help" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: 'var(--pf-t--global--color--brand--default)' }}
                    >
                      Raise a ticket with our team
                    </a>
                    {' '}to request more seats.
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
                          id={`workshop-display-name-${index}`}
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
                  Create Multi Workshop
                </Button>
                <Button variant="link" onClick={() => navigate(selectedNamespace ? `/multi-workshop/${selectedNamespace.name}` : '/multi-workshop')}>
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
