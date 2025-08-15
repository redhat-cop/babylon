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
import { apiPaths, fetcher, patchMultiWorkshop, deleteMultiWorkshop, approveMultiWorkshop, dateToApiString } from '@app/api';
import { MultiWorkshop, SfdcType } from '@app/types';
import LocalTimestamp from '@app/components/LocalTimestamp';
import TimeInterval from '@app/components/TimeInterval';
import EditableText from '@app/components/EditableText';
import Label from '@app/components/Label';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import SalesforceIdField from './SalesforceIdField';
import useSession from '@app/utils/useSession';
import purposeOptions from './purposeOptions.json';

import './multiworkshop-detail.css';

const MultiWorkshopDetail: React.FC = () => {
  const navigate = useNavigate();
  const { namespace, name } = useParams();
  const { userNamespace, isAdmin } = useSession().getSession();
  const [activeTab, setActiveTab] = useState<string>('details');
  const [modalDelete, openModalDelete] = useModal();
  const [modalApprove, openModalApprove] = useModal();

  const { data: multiworkshop, error } = useSWR<MultiWorkshop>(
    namespace && name ? apiPaths.MULTIWORKSHOP({ namespace, multiworkshopName: name }) : null,
    fetcher,
    {
      refreshInterval: 8000,
    }
  );

  function getMultiWorkshopDisplayName(multiworkshop: MultiWorkshop): string {
    return multiworkshop.spec.displayName || multiworkshop.spec.name || multiworkshop.metadata.name;
  }



  function getStatusText(multiworkshop: MultiWorkshop): string {
    const now = new Date();
    const startDate = multiworkshop.spec.startDate ? new Date(multiworkshop.spec.startDate) : null;
    const endDate = multiworkshop.spec.endDate ? new Date(multiworkshop.spec.endDate) : null;
    
    if (startDate && endDate) {
      if (now < startDate) return 'Upcoming';
      if (now > endDate) return 'Ended';
      return 'Active';
    }
    
    return 'No Schedule';
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

  async function onApproveConfirm(): Promise<void> {
    if (!multiworkshop) return;
    
    try {
      const result = await approveMultiWorkshop({
        name: multiworkshop.metadata.name,
        namespace: multiworkshop.metadata.namespace,
      });
      
      // Update local data via SWR mutate for immediate UI update
      mutate(apiPaths.MULTIWORKSHOP({ namespace: multiworkshop.metadata.namespace, multiworkshopName: multiworkshop.metadata.name }), result.multiworkshop, false);
    } catch (error) {
      console.error('Failed to approve multiworkshop:', error);
      // You might want to show an error message here
    }
  }

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
        <p>This action cannot be undone. All associated workshop data WILL NOT be deleted.</p>
      </Modal>

      <Modal
        ref={modalApprove}
        onConfirm={onApproveConfirm}
        title={`Approve event ${getMultiWorkshopDisplayName(multiworkshop)}?`}
      >
        <p>This will create workshop instances for each asset and make the event available to users.</p>
      </Modal>

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
            <Label key="event-status-label">
              {getStatusText(multiworkshop)}
            </Label>
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

                {multiworkshop.metadata.annotations?.['babylon.gpte.redhat.com/approved-by'] && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Approved By</DescriptionListTerm>
                    <DescriptionListDescription>
                      {multiworkshop.metadata.annotations['babylon.gpte.redhat.com/approved-by']}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}

                {multiworkshop.metadata.annotations?.['babylon.gpte.redhat.com/approved-at'] && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Approved At</DescriptionListTerm>
                    <DescriptionListDescription>
                      <LocalTimestamp timestamp={multiworkshop.metadata.annotations['babylon.gpte.redhat.com/approved-at']} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}

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
              
              {/* Approval button for admin users if not yet approved */}
              {isAdmin && !multiworkshop.metadata.annotations?.[`babylon.gpte.redhat.com/approved-at`] && (
                <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--pf-t--color--border--default)' }}>
                  <Button 
                    variant="primary" 
                    onClick={openModalApprove}
                  >
                    Approve Event
                  </Button>
                </div>
              )}
              </>
            ) : null}
          </Tab>
          <Tab eventKey="assets" title={<TabTitleText>Workshop Assets</TabTitleText>}>
            {activeTab === 'assets' ? (
              <>
                <Title headingLevel="h2" size="xl" style={{ marginBottom: '24px' }}>
                  Workshop Assets ({multiworkshop.spec.assets?.length || 0})
                </Title>
                
                {multiworkshop.spec.assets && multiworkshop.spec.assets.length > 0 ? (
                  <Table aria-label="Workshop assets" variant="compact">
                    <Thead>
                      <Tr>
                        <Th>Workshop Name</Th>
                        <Th>Display Name</Th>
                        <Th>Description</Th>
                        <Th>Status</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {multiworkshop.spec.assets.map((asset, index) => (
                        <Tr key={index}>
                          <Td>
                            {asset.workshopName ? (
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
                              placeholder="Workshop description"
                              componentType="TextArea"
                            />
                          </Td>
                          <Td>
                            {asset.workshopName ? (
                              <span>Created</span>
                            ) : (
                              <span>Pending</span>
                            )}
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
              <DescriptionList isHorizontal>
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
                  <DescriptionListTerm>Start Date</DescriptionListTerm>
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
