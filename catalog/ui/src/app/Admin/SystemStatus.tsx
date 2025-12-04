import React, { useState } from 'react';
import {
  PageSection,
  Title,
  Card,
  CardBody,
  CardTitle,
  Switch,
  TextArea,
  FormGroup,
  FormHelperText,
  Form,
  Button,
  Alert,
  Spinner,
  Split,
  SplitItem,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
} from '@patternfly/react-core';
import { Modal, ModalVariant } from '@patternfly/react-core/deprecated';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import useSWR from 'swr';
import { apiPaths, fetcher, updateSystemStatus, SystemStatus as SystemStatusType } from '@app/api';

import './admin.css';

const SystemStatus: React.FC = () => {
  const { data: systemStatus, error, isLoading, mutate } = useSWR<SystemStatusType>(
    apiPaths.SYSTEM_STATUS(),
    fetcher,
    {
      refreshInterval: 10000,
      revalidateOnFocus: true,
    }
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Local form state
  const [workshopsBlocked, setWorkshopsBlocked] = useState<boolean | undefined>(undefined);
  const [workshopsMessage, setWorkshopsMessage] = useState<string | undefined>(undefined);
  const [servicesBlocked, setServicesBlocked] = useState<boolean | undefined>(undefined);
  const [servicesMessage, setServicesMessage] = useState<string | undefined>(undefined);

  // Use local state if set, otherwise use fetched data
  const currentWorkshopsBlocked = workshopsBlocked ?? systemStatus?.workshops_ordering_blocked ?? false;
  const currentWorkshopsMessage = workshopsMessage ?? systemStatus?.workshops_ordering_blocked_message ?? '';
  const currentServicesBlocked = servicesBlocked ?? systemStatus?.services_ordering_blocked ?? false;
  const currentServicesMessage = servicesMessage ?? systemStatus?.services_ordering_blocked_message ?? '';

  const hasChanges = 
    (workshopsBlocked !== undefined && workshopsBlocked !== systemStatus?.workshops_ordering_blocked) ||
    (workshopsMessage !== undefined && workshopsMessage !== systemStatus?.workshops_ordering_blocked_message) ||
    (servicesBlocked !== undefined && servicesBlocked !== systemStatus?.services_ordering_blocked) ||
    (servicesMessage !== undefined && servicesMessage !== systemStatus?.services_ordering_blocked_message);

  // Check if user is trying to disable (block) any ordering
  const isDisablingOrdering = 
    (workshopsBlocked === true && systemStatus?.workshops_ordering_blocked !== true) ||
    (servicesBlocked === true && systemStatus?.services_ordering_blocked !== true);

  const performSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updates: Partial<SystemStatusType> = {};
      
      if (workshopsBlocked !== undefined) {
        updates.workshops_ordering_blocked = workshopsBlocked;
      }
      if (workshopsMessage !== undefined) {
        updates.workshops_ordering_blocked_message = workshopsMessage;
      }
      if (servicesBlocked !== undefined) {
        updates.services_ordering_blocked = servicesBlocked;
      }
      if (servicesMessage !== undefined) {
        updates.services_ordering_blocked_message = servicesMessage;
      }

      await updateSystemStatus(updates);
      
      // Reset local state and refresh from server
      setWorkshopsBlocked(undefined);
      setWorkshopsMessage(undefined);
      setServicesBlocked(undefined);
      setServicesMessage(undefined);
      
      await mutate();
      setSaveSuccess(true);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update system status');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    // If user is disabling ordering, show confirmation modal
    if (isDisablingOrdering) {
      setIsConfirmModalOpen(true);
    } else {
      // Otherwise, save directly
      performSave();
    }
  };

  const handleConfirmDisable = () => {
    setIsConfirmModalOpen(false);
    performSave();
  };

  if (isLoading) {
    return (
      <PageSection>
        <Spinner /> Loading system status...
      </PageSection>
    );
  }

  if (error) {
    return (
      <PageSection>
        <Alert variant="danger" title="Failed to load system status">
          {error.message || 'Unknown error occurred'}
        </Alert>
      </PageSection>
    );
  }

  return (
    <PageSection>
      <Title headingLevel="h1" size="2xl" style={{ marginBottom: '1rem' }}>
        System Status
      </Title>
      
      <p style={{ marginBottom: '1.5rem', color: 'var(--pf-t--global--color--200)' }}>
        Manage system-wide ordering blocks. Use these controls to temporarily disable ordering 
        during incidents, maintenance, or capacity issues. Admins can still order even when blocked.
      </p>

      {saveError && (
        <Alert variant="danger" title="Failed to save" style={{ marginBottom: '1rem' }} isInline>
          {saveError}
        </Alert>
      )}

      {saveSuccess && (
        <Alert variant="success" title="Settings saved successfully" style={{ marginBottom: '1rem' }} isInline />
      )}

      <Split hasGutter>
        <SplitItem isFilled>
          <Card>
            <CardTitle>Workshop Ordering</CardTitle>
            <CardBody>
              <Form>
                <FormGroup fieldId="workshops-blocked">
                  <Switch
                    id="workshops-blocked-switch"
                    label={currentWorkshopsBlocked ? "Workshop ordering is BLOCKED" : "Workshop ordering is ENABLED"}
                    isChecked={!currentWorkshopsBlocked}
                    onChange={(_event, checked) => {
                      const isBlocked = !checked;
                      setWorkshopsBlocked(isBlocked);
                      // Clear message when re-enabling ordering
                      if (!isBlocked) {
                        setWorkshopsMessage('');
                      }
                    }}
                    aria-label="Toggle workshop ordering"
                  />
                </FormGroup>
                
                <FormGroup 
                  label="Block Message" 
                  fieldId="workshops-message"
                >
                  <TextArea
                    id="workshops-message"
                    value={currentWorkshopsMessage}
                    onChange={(_event, value) => setWorkshopsMessage(value)}
                    placeholder="Workshop ordering is temporarily disabled due to..."
                    rows={3}
                    isDisabled={!currentWorkshopsBlocked}
                  />
                  <FormHelperText>
                    Custom message to display to users when workshop ordering is blocked
                  </FormHelperText>
                </FormGroup>
              </Form>
            </CardBody>
          </Card>
        </SplitItem>

        <SplitItem isFilled>
          <Card>
            <CardTitle>Service Ordering</CardTitle>
            <CardBody>
              <Form>
                <FormGroup fieldId="services-blocked">
                  <Switch
                    id="services-blocked-switch"
                    label={currentServicesBlocked ? "Service ordering is BLOCKED" : "Service ordering is ENABLED"}
                    isChecked={!currentServicesBlocked}
                    onChange={(_event, checked) => {
                      const isBlocked = !checked;
                      setServicesBlocked(isBlocked);
                      // Clear message when re-enabling ordering
                      if (!isBlocked) {
                        setServicesMessage('');
                      }
                    }}
                    aria-label="Toggle service ordering"
                  />
                </FormGroup>
                
                <FormGroup 
                  label="Block Message" 
                  fieldId="services-message"
                >
                  <TextArea
                    id="services-message"
                    value={currentServicesMessage}
                    onChange={(_event, value) => setServicesMessage(value)}
                    placeholder="Service ordering is temporarily disabled due to..."
                    rows={3}
                    isDisabled={!currentServicesBlocked}
                  />
                  <FormHelperText>
                    Custom message to display to users when service ordering is blocked
                  </FormHelperText>
                </FormGroup>
              </Form>
            </CardBody>
          </Card>
        </SplitItem>
      </Split>

      <div style={{ marginTop: '1.5rem' }}>
        <Button 
          variant="primary" 
          onClick={handleSave} 
          isDisabled={!hasChanges || isSaving}
          isLoading={isSaving}
        >
          Save Changes
        </Button>
      </div>

      <Card style={{ marginTop: '2rem' }}>
        <CardTitle>Current Status</CardTitle>
        <CardBody>
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>Workshop Ordering</DescriptionListTerm>
              <DescriptionListDescription>
                {systemStatus?.workshops_ordering_blocked ? (
                  <span style={{ color: 'var(--pf-t--global--color--status--danger--default)' }}>
                    ⛔ BLOCKED
                  </span>
                ) : (
                  <span style={{ color: 'var(--pf-t--global--color--status--success--default)' }}>
                    ✓ Enabled
                  </span>
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Service Ordering</DescriptionListTerm>
              <DescriptionListDescription>
                {systemStatus?.services_ordering_blocked ? (
                  <span style={{ color: 'var(--pf-t--global--color--status--danger--default)' }}>
                    ⛔ BLOCKED
                  </span>
                ) : (
                  <span style={{ color: 'var(--pf-t--global--color--status--success--default)' }}>
                    ✓ Enabled
                  </span>
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>
            {systemStatus?.last_updated_by && (
              <DescriptionListGroup>
                <DescriptionListTerm>Last Updated By</DescriptionListTerm>
                <DescriptionListDescription>
                  {systemStatus.last_updated_by}
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
            {systemStatus?.last_updated_at && (
              <DescriptionListGroup>
                <DescriptionListTerm>Last Updated At</DescriptionListTerm>
                <DescriptionListDescription>
                  {new Date(systemStatus.last_updated_at).toLocaleString()}
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
          </DescriptionList>
        </CardBody>
      </Card>

      {/* Confirmation Modal for Disabling Ordering */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Are you sure you want to disable this functionality?"
        titleIconVariant="warning"
        variant={ModalVariant.small}
        actions={[
          <Button
            key="confirm"
            variant="danger"
            onClick={handleConfirmDisable}
          >
            Yes, Disable Ordering
          </Button>,
          <Button
            key="cancel"
            variant="link"
            onClick={() => setIsConfirmModalOpen(false)}
          >
            Cancel
          </Button>,
        ]}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <ExclamationTriangleIcon 
            style={{ 
              color: 'var(--pf-t--global--color--status--warning--default)', 
              fontSize: '2rem',
              flexShrink: 0,
              marginTop: '0.25rem'
            }} 
          />
          <div>
            <p style={{ marginBottom: '1rem' }}>
              <strong>This action affects the entire platform and may impact all users.</strong>
            </p>
            <p>
              Make sure you have manager approval before proceeding. Do you want to continue?
            </p>
          </div>
        </div>
      </Modal>
    </PageSection>
  );
};

export default SystemStatus;
