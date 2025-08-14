import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from '@patternfly/react-core';
import PlusIcon from '@patternfly/react-icons/dist/js/icons/plus-icon';
import { createMultiWorkshop, dateToApiString } from '@app/api';
import { CatalogItem, SfdcType, TPurposeOpts, ServiceNamespace } from '@app/types';
import { displayName } from '@app/util';
import CatalogItemSelectorModal from './CatalogItemSelectorModal';
import SalesforceIdField from './SalesforceIdField';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import ProjectSelector from '@app/components/ProjectSelector';
import purposeOptions from './purposeOptions.json';

import './multiworkshop-create.css';

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
    assets: [{ key: '', assetNamespace: '', workshopDisplayName: '', workshopDescription: '' }]
  });

  const isFormValid = createFormData.name && 
                      createFormData.startDate && 
                      createFormData.endDate &&
                      (isAdmin || (createFormData.salesforceId && createFormData.salesforceType));

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
          ...(asset.workshopDescription?.trim() && { workshopDescription: asset.workshopDescription.trim() })
        }));
      
      const payload = {
        name: createFormData.name,
        description: createFormData.description || undefined,
        startDate: dateToApiString(new Date(createFormData.startDate)),
        endDate: dateToApiString(new Date(createFormData.endDate)),
        numberSeats: createFormData.numberSeats || undefined,
        salesforceId: createFormData.salesforceId || undefined,
        purpose: createFormData.purpose || undefined,
        'purpose-activity': createFormData.activity || undefined,
        backgroundImage: createFormData.backgroundImage || undefined,
        logoImage: createFormData.logoImage || undefined,
        assets: filteredAssets.length > 0 ? filteredAssets : undefined,
        namespace: selectedNamespace?.name || undefined,
      };

      // Remove undefined fields
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

      // Use the API function that handles authorization automatically
      await createMultiWorkshop(payload);

      // Navigate back to the list page
      navigate(selectedNamespace ? `/event-wizard/${selectedNamespace.name}` : '/event-wizard');
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
      assets: [...prev.assets, { key: '', assetNamespace: '', workshopDisplayName: '', workshopDescription: '' }]
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
                workshopDisplayName: workshopDisplayName  // Always update with new catalog item's display name
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
        <Card>
          <CardBody>
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
                  <FormGroup label="Start Date" isRequired fieldId="startDate">
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
                  onPlus={() => setCreateFormData(prev => ({ ...prev, numberSeats: prev.numberSeats + 1 }))}
                  onChange={(event) => {
                    const value = parseInt((event.target as HTMLInputElement).value) || 1;
                    setCreateFormData(prev => ({ ...prev, numberSeats: Math.max(1, value) }));
                  }}
                  min={1}
                />
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
          </CardBody>
        </Card>
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
