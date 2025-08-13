import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
import {
  EmptyState,
  EmptyStateBody,
  PageSection,
  Split,
  SplitItem,
  Title,
  EmptyStateFooter,
  Button,
  Form,
  FormGroup,
  TextInput,
  DatePicker,
  NumberInput,
  TextArea,
} from '@patternfly/react-core';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import PlusIcon from '@patternfly/react-icons/dist/js/icons/plus-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { apiPaths, createMultiWorkshop, dateToApiString, deleteMultiWorkshop, fetcher } from '@app/api';
import { MultiWorkshop, MultiWorkshopList } from '@app/types';
import { compareK8sObjectsArr, displayName, FETCH_BATCH_LIMIT } from '@app/util';
import Footer from '@app/components/Footer';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import Modal, { useModal } from '@app/Modal/Modal';
import ProjectSelector from '@app/components/ProjectSelector';

import './admin.css';

function keywordMatch(multiworkshop: MultiWorkshop, keyword: string): boolean {
  const keywordLowerCased = keyword.toLowerCase();
  if (
    multiworkshop.metadata.name.includes(keywordLowerCased) ||
    multiworkshop.metadata.namespace.includes(keywordLowerCased) ||
    (multiworkshop.spec.description && multiworkshop.spec.description.toLowerCase().includes(keywordLowerCased)) ||
    (multiworkshop.spec.displayName && multiworkshop.spec.displayName.toLowerCase().includes(keywordLowerCased))
  ) {
    return true;
  }
  return false;
}

const MultiWorkshops: React.FC<{}> = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();
  const [modalAction, openModalAction] = useModal();
  const [createModal, openCreateModal] = useModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const keywordFilter = useMemo(
    () =>
      searchParams.has('search')
        ? searchParams
            .get('search')
            .trim()
            .split(/ +/)
            .filter((w) => w != '')
        : null,
    [searchParams.get('search')],
  );
  const [modalState, setModalState] = useState<{ action?: string; multiworkshop?: MultiWorkshop }>({});
  const [selectedUids, setSelectedUids] = useState([]);
  const [createFormData, setCreateFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    numberSeats: 10,
    salesforceId: '',
    purpose: '',
    'purpose-activity': '',
    backgroundImage: '',
    logoImage: '',
    assets: [{ key: '', workshopDisplayName: '' }]
  });
  const { cache } = useSWRConfig();
  const showModal = useCallback(
    ({ action, multiworkshop }: { action: string; multiworkshop?: MultiWorkshop }) => {
      setModalState({ action, multiworkshop });
      openModalAction();
    },
    [openModalAction],
  );

  const {
    data: multiworkshopsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<MultiWorkshopList>(
    (index, previousPageData) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.MULTIWORKSHOPS({ namespace, limit: FETCH_BATCH_LIMIT, continueId });
    },
    fetcher,
    {
      refreshInterval: 8000,
      revalidateFirstPage: true,
      revalidateAll: true,
      compare: (currentData, newData) => {
        if (currentData === newData) return true;
        if (!currentData || currentData.length === 0) return false;
        if (!newData || newData.length === 0) return false;
        if (currentData.length !== newData.length) return false;
        for (let i = 0; i < currentData.length; i++) {
          if (!compareK8sObjectsArr(currentData[i].items, newData[i].items)) return false;
        }
        return true;
      },
    },
  );
  const isReachingEnd = multiworkshopsPages && !multiworkshopsPages[multiworkshopsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !multiworkshopsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && multiworkshopsPages && typeof multiworkshopsPages[size - 1] === 'undefined');

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: MultiWorkshop[]; action: 'update' | 'delete' }) => {
      const multiworkshopsPagesCpy = JSON.parse(JSON.stringify(multiworkshopsPages));
      let p: MultiWorkshopList;
      let i: number;
      for ([i, p] of multiworkshopsPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              multiworkshopsPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              multiworkshopsPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(multiworkshopsPagesCpy);
          }
        }
      }
    },
    [mutate, multiworkshopsPages],
  );
  
  const filterMultiWorkshop = useCallback(
    (multiworkshop: MultiWorkshop): boolean => {
      // Hide anything pending deletion
      if (multiworkshop.metadata.deletionTimestamp) {
        return false;
      }
      if (keywordFilter) {
        for (const keyword of keywordFilter) {
          if (!keywordMatch(multiworkshop, keyword)) {
            return false;
          }
        }
      }
      return true;
    },
    [keywordFilter],
  );

  const multiworkshops: MultiWorkshop[] = useMemo(
    () => [].concat(...multiworkshopsPages.map((page) => page.items)).filter(filterMultiWorkshop) || [],
    [filterMultiWorkshop, multiworkshopsPages],
  );

  // Trigger continue fetching more resource claims on scroll.
  const scrollHandler = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollable = e.currentTarget;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !isReachingEnd && !isLoadingMore) {
      setSize(size + 1);
    }
  };

  async function onMultiWorkshopDeleteConfirm(): Promise<void> {
    const deletedMultiWorkshops: MultiWorkshop[] = [];
    if (modalState.multiworkshop) {
      await deleteMultiWorkshop(modalState.multiworkshop);
      deletedMultiWorkshops.push(modalState.multiworkshop);
    } else {
      for (const multiworkshop of multiworkshops) {
        if (selectedUids.includes(multiworkshop.metadata.uid)) {
          await deleteMultiWorkshop(multiworkshop);
          cache.delete(
            apiPaths.MULTIWORKSHOP({
              namespace: multiworkshop.metadata.namespace,
              multiworkshopName: multiworkshop.metadata.name,
            }),
          );
          deletedMultiWorkshops.push(multiworkshop);
        }
      }
    }
    revalidate({ updatedItems: deletedMultiWorkshops, action: 'delete' });
  }

  function getMultiWorkshopDisplayName(multiworkshop: MultiWorkshop): string {
    return multiworkshop.spec.displayName || multiworkshop.spec.name || multiworkshop.metadata.name;
  }

  async function onCreateMultiWorkshop(): Promise<void> {
    try {
      // Filter out empty assets and include key and workshopDisplayName fields
      const filteredAssets = createFormData.assets
        .filter(asset => asset.key.trim() !== '')
        .map(asset => ({ 
          key: asset.key.trim(),
          ...(asset.workshopDisplayName?.trim() && { workshopDisplayName: asset.workshopDisplayName.trim() })
        }));
      
      const payload = {
        name: createFormData.name,
        description: createFormData.description || undefined,
        startDate: dateToApiString(new Date(createFormData.startDate)),
        endDate: dateToApiString(new Date(createFormData.endDate)),
        numberSeats: createFormData.numberSeats || undefined,
        salesforceId: createFormData.salesforceId || undefined,
        purpose: createFormData.purpose || undefined,
        'purpose-activity': createFormData['purpose-activity'] || undefined,
        backgroundImage: createFormData.backgroundImage || undefined,
        logoImage: createFormData.logoImage || undefined,
        assets: filteredAssets.length > 0 ? filteredAssets : undefined,
      };

      // Remove undefined fields
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

      // Use the API function that handles authorization automatically
      await createMultiWorkshop(payload);

      // Reset form
      setCreateFormData({
        name: '',
        description: '',
        startDate: '',
        endDate: '',
        numberSeats: 10,
        salesforceId: '',
        purpose: '',
        'purpose-activity': '',
        backgroundImage: '',
        logoImage: '',
        assets: [{ key: '', workshopDisplayName: '' }]
      });
      
      // Refresh the list
      mutate();
    } catch (error) {
      console.error('Error creating MultiWorkshop:', error);
      // TODO: Add proper error handling/notification
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
      assets: [...prev.assets, { key: '', workshopDisplayName: '' }]
    }));
  }

  function removeAsset(index: number) {
    setCreateFormData(prev => ({
      ...prev,
      assets: prev.assets.filter((_, i) => i !== index)
    }));
  }

  return (
    <div onScroll={scrollHandler} className="admin-container">
      <Modal
        ref={modalAction}
        onConfirm={onMultiWorkshopDeleteConfirm}
        title={
          modalState.multiworkshop 
            ? `Delete multi-workshop ${getMultiWorkshopDisplayName(modalState.multiworkshop)}?` 
            : 'Delete selected multi-workshops? '
        }
      >
        <p>All associated workshops and provisioned services WILL NOT be deleted.</p>
      </Modal>

      <Modal
        ref={createModal}
        onConfirm={onCreateMultiWorkshop}
        title="Create Multi-Workshop"
        isDisabled={!createFormData.name || !createFormData.startDate || !createFormData.endDate}
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '8px' }}>
          <Form style={{ padding: '8px 0' }}>
          <FormGroup label="Name" isRequired fieldId="name">
            <TextInput
              isRequired
              type="text"
              id="name"
              name="name"
              value={createFormData.name}
              onChange={(_, value) => setCreateFormData(prev => ({ ...prev, name: value }))}
              placeholder="Enter multi-workshop name"
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

          <div style={{ marginTop: '20px' }}>
          <Split hasGutter>
            <SplitItem isFilled>
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
            </SplitItem>
            <SplitItem isFilled>
              <FormGroup label="Salesforce ID" fieldId="salesforceId">
                <TextInput
                  id="salesforceId"
                  name="salesforceId"
                  value={createFormData.salesforceId}
                  onChange={(_, value) => setCreateFormData(prev => ({ ...prev, salesforceId: value }))}
                  placeholder="Optional Salesforce ID"
                />
              </FormGroup>
            </SplitItem>
          </Split>
          </div>

          <div style={{ marginTop: '20px' }}>
          <Split hasGutter>
            <SplitItem isFilled>
              <FormGroup label="Purpose" fieldId="purpose">
                <TextInput
                  id="purpose"
                  name="purpose"
                  value={createFormData.purpose}
                  onChange={(_, value) => setCreateFormData(prev => ({ ...prev, purpose: value }))}
                  placeholder="e.g., Customer Training"
                />
              </FormGroup>
            </SplitItem>
            <SplitItem isFilled>
              <FormGroup label="Purpose Activity" fieldId="purpose-activity">
                <TextInput
                  id="purpose-activity"
                  name="purpose-activity"
                  value={createFormData['purpose-activity']}
                  onChange={(_, value) => setCreateFormData(prev => ({ ...prev, 'purpose-activity': value }))}
                  placeholder="e.g., Demo Workshop"
                />
              </FormGroup>
            </SplitItem>
          </Split>
          </div>

          <div style={{ marginTop: '20px' }}>
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
          </div>

          <div style={{ marginTop: '24px' }}>
          <FormGroup label="Assets" fieldId="assets">
            {createFormData.assets.map((asset, index) => (
              <div 
                key={index} 
                style={{ 
                  marginBottom: '12px', 
                  padding: '16px', 
                  border: '1px solid var(--pf-t--chart--color--black--300)', 
                  borderRadius: '4px',
                  backgroundColor: 'var(--pf-t--chart--color--black--100)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Asset {index + 1}</span>
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
                <FormGroup label="Asset Key" fieldId={`asset-key-${index}`} style={{ marginBottom: '12px' }}>
                  <TextInput
                    placeholder="Asset key (e.g., tests.babylon-empty-config.prod)"
                    value={asset.key}
                    onChange={(_, value) => updateAsset(index, 'key', value)}
                  />
                </FormGroup>
                <FormGroup label="Workshop Display Name" fieldId={`asset-display-name-${index}`}>
                  <TextInput
                    placeholder="Optional display name for this workshop (e.g., 'Container Basics')"
                    value={asset.workshopDisplayName}
                    onChange={(_, value) => updateAsset(index, 'workshopDisplayName', value)}
                  />
                </FormGroup>
              </div>
            ))}
            <Button variant="link" onClick={addAsset} icon={<PlusIcon />}>
              Add Asset
            </Button>
          </FormGroup>
          </div>
          </Form>
        </div>
      </Modal>
      <PageSection hasBodyWrapper={false} key="header" className="admin-header">
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Multi-Workshops
            </Title>
          </SplitItem>
          <SplitItem>
            <ProjectSelector
              currentNamespaceName={namespace}
              onSelect={(n) => {
                navigate(`/admin/multiworkshops/${n.name}?${searchParams.toString()}`);
              }}
            />
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              placeholder="Search..."
              onSearch={(value) => {
                if (value) {
                  searchParams.set('search', value.join(' '));
                } else if (searchParams.has('search')) {
                  searchParams.delete('search');
                }
                setSearchParams(searchParams);
              }}
            />
          </SplitItem>
          <SplitItem>
            <Button 
              variant="primary" 
              icon={<PlusIcon />}
              onClick={openCreateModal}
            >
              Create Multi-Workshop
            </Button>
          </SplitItem>
          <SplitItem>
            <ButtonCircleIcon
              isDisabled={selectedUids.length === 0}
              onClick={() => showModal({ action: 'delete' })}
              description="Delete Selected"
              icon={TrashIcon}
            />
          </SplitItem>
        </Split>
      </PageSection>
      {multiworkshops.length === 0 ? (
        <PageSection hasBodyWrapper={false} key="multiworkshops-list-empty">
          <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No multi-workshops found." variant="full">
            <EmptyStateFooter>
              {keywordFilter ? (
                <EmptyStateBody>No multi-workshops matched search.</EmptyStateBody>
              ) : (
                <EmptyStateBody>
                  Create multi-workshops using the API.
                </EmptyStateBody>
              )}
            </EmptyStateFooter>
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection hasBodyWrapper={false} key="body" className="admin-body">
          <SelectableTable
            columns={['Name', 'Service Namespace', 'Assets', 'Seats', 'Start Date', 'End Date', 'Created At', 'Actions']}
            onSelectAll={(isSelected: boolean) => {
              if (isSelected) {
                setSelectedUids(multiworkshops.map((multiworkshop) => multiworkshop.metadata.uid));
              } else {
                setSelectedUids([]);
              }
            }}
            rows={multiworkshops.map((multiworkshop: MultiWorkshop) => {
              const actionHandlers = {
                delete: () => showModal({ action: 'delete', multiworkshop }),
              };

              const cells: any[] = [];
              cells.push(
                // Name
                <>
                  <Link
                    key="multiworkshops"
                    to={`/admin/multiworkshops/${multiworkshop.metadata.namespace}/${multiworkshop.metadata.name}`}
                  >
                    {getMultiWorkshopDisplayName(multiworkshop)}
                  </Link>
                  <OpenshiftConsoleLink key="console" resource={multiworkshop} />
                </>,
                // Project
                <>
                  <Link key="service-namespace" to={`/services/${multiworkshop.metadata.namespace}`}>
                    {multiworkshop.metadata.namespace}
                  </Link>
                  <OpenshiftConsoleLink key="console" resource={multiworkshop} linkToNamespace={true} />
                </>,
                // Assets
                <>{multiworkshop.spec.assets ? multiworkshop.spec.assets.length : 0}</>,
                // Seats
                <>{multiworkshop.spec.numberSeats || 'N/A'}</>,
                // Start Date
                <>
                  {multiworkshop.spec.startDate ? (
                    <LocalTimestamp key="start-timestamp" timestamp={multiworkshop.spec.startDate} />
                  ) : (
                    'N/A'
                  )}
                </>,
                // End Date
                <>
                  {multiworkshop.spec.endDate ? (
                    <LocalTimestamp key="end-timestamp" timestamp={multiworkshop.spec.endDate} />
                  ) : (
                    'N/A'
                  )}
                </>,
                // Created At
                <>
                  <LocalTimestamp key="timestamp" timestamp={multiworkshop.metadata.creationTimestamp} />
                  <br key="break" />
                  (<TimeInterval key="interval" toTimestamp={multiworkshop.metadata.creationTimestamp} />)
                </>,
                // Actions
                <React.Fragment key="actions">
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 'var(--pf-t--global--spacer--sm)',
                    }}
                  >
                    <ButtonCircleIcon
                      key="actions__delete"
                      onClick={actionHandlers.delete}
                      description="Delete"
                      icon={TrashIcon}
                    />
                  </div>
                </React.Fragment>,
              );
              return {
                cells: cells,
                onSelect: (isSelected) =>
                  setSelectedUids((uids) => {
                    if (isSelected) {
                      if (uids.includes(multiworkshop.metadata.uid)) {
                        return uids;
                      } else {
                        return [...uids, multiworkshop.metadata.uid];
                      }
                    } else {
                      return uids.filter((uid) => uid !== multiworkshop.metadata.uid);
                    }
                  }),
                selected: selectedUids.includes(multiworkshop.metadata.uid),
              };
            })}
          />
        </PageSection>
      )}
      <Footer />
    </div>
  );
};

export default MultiWorkshops;
