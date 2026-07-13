import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Checkbox,
  Form,
  FormGroup,
  FormHelperText,
  PageSection,
  TextArea,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { createWhiteGloveRequest } from '@app/api';
import { CatalogItem } from '@app/types';
import { displayName } from '@app/util';
import CatalogItemSelectorModal from '@app/MultiWorkshops/CatalogItemSelectorModal';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import Footer from '@app/components/Footer';
import useSession from '@app/utils/useSession';
import purposeOptions from '@app/MultiWorkshops/purposeOptions.json';

import '@app/Catalog/catalog-item-form.css';
import './white-glove.css';

const WhiteGloveCreateContent: React.FC = () => {
  const navigate = useNavigate();
  const { userNamespace } = useSession().getSession();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCatalogSelectorOpen, setIsCatalogSelectorOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null);
  const [activity, setActivity] = useState('');
  const [purpose, setPurpose] = useState('');
  const [explanation, setExplanation] = useState('');
  const [salesforceId, setSalesforceId] = useState('');
  const [skipSalesforce, setSkipSalesforce] = useState(false);
  const [numberOfUsers, setNumberOfUsers] = useState<number>(1);
  const [eventDate] = useState<string>('');
  const [eventEndDate] = useState<string>('');
  const [notes, setNotes] = useState('');

  function handleCatalogItemSelect(catalogItemOrItems: CatalogItem | CatalogItem[]) {
    const item = Array.isArray(catalogItemOrItems) ? catalogItemOrItems[0] : catalogItemOrItems;
    if (item) {
      setSelectedCatalogItem(item);
    }
    setIsCatalogSelectorOpen(false);
  }

  async function onSubmit(): Promise<void> {
    if (!selectedCatalogItem || !userNamespace) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await createWhiteGloveRequest({
        catalogItemName: selectedCatalogItem.metadata.name,
        catalogItemNamespace: selectedCatalogItem.metadata.namespace,
        displayName: displayName(selectedCatalogItem),
        purpose,
        activity,
        numberOfUsers,
        eventDate: eventDate || undefined,
        eventEndDate: eventEndDate || undefined,
        notes: notes || undefined,
        salesforceItems:
          !skipSalesforce && salesforceId.trim()
            ? [{ id: salesforceId.trim(), type: 'opportunity' as const }]
            : undefined,
        namespace: userNamespace.name,
      });

      navigate(`/white-glove/${result.metadata.namespace}/${result.metadata.name}`);
    } catch (error) {
      console.error('Error creating white glove request:', error);
      setSubmitError('Failed to submit white glove request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const isFormValid = !!selectedCatalogItem && !!activity && !!purpose;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <PageSection variant="default" className="catalog-item-form">
        <Breadcrumb>
          <BreadcrumbItem>
            <Button variant="link" onClick={() => navigate('/white-glove')}>
              White Glove Requests
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>New Request</BreadcrumbItem>
        </Breadcrumb>

        <Title headingLevel="h1" size="2xl" style={{ marginBottom: '8px' }}>
          Request White Glove Workshop
        </Title>
        <p style={{ color: 'var(--pf-t--global--text--color--subtle)', marginBottom: '16px' }}>
          Submit a request at least 14 days in advance to allow our operations team to prepare your customized workshop
          experience.
        </p>

        <Alert variant="info" title="About White Glove Workshops" isInline style={{ marginBottom: '24px' }}>
          <p>
            Our team offers a customized customer/partner-facing white-glove workshop service. We handle all the
            logistics including provisioning, environment configuration, and day-of-event support so you can focus on
            delivering an excellent experience to your attendees.
          </p>
        </Alert>

        {submitError && (
          <Alert variant="danger" title="Submission Error" isInline style={{ marginBottom: '16px' }}>
            <p>{submitError}</p>
          </Alert>
        )}

        <Form className="catalog-item-form__form">
          <FormGroup label="Catalog Item" isRequired fieldId="catalog-item">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <TextInput
                  id="catalog-item"
                  placeholder="Select a catalog item..."
                  value={
                    selectedCatalogItem
                      ? `${selectedCatalogItem.metadata.namespace}.${selectedCatalogItem.metadata.name}`
                      : ''
                  }
                  readOnlyVariant="default"
                  style={{
                    backgroundColor: 'var(--pf-t--color--background--disabled)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setIsCatalogSelectorOpen(true)}
                />
              </div>
              <Button variant="secondary" onClick={() => setIsCatalogSelectorOpen(true)}>
                {selectedCatalogItem ? 'Change' : 'Select'}
              </Button>
            </div>
          </FormGroup>

          <ActivityPurposeSelector
            value={{ purpose, activity, explanation }}
            purposeOpts={purposeOptions}
            onChange={(newActivity: string, newPurpose: string, newExplanation: string) => {
              setActivity(newActivity || '');
              setPurpose(newPurpose || '');
              setExplanation(newExplanation || '');
            }}
          />

          <FormGroup label="Salesforce ID" fieldId="salesforce-id">
            <TextInput
              id="salesforce-id"
              value={salesforceId}
              onChange={(_, value) => setSalesforceId(value)}
              isDisabled={skipSalesforce}
              placeholder="Enter Salesforce Opportunity, Campaign, or Project ID"
            />
            <FormHelperText>
              <Checkbox
                id="skip-salesforce"
                label="I do not have a Salesforce ID for this request"
                isChecked={skipSalesforce}
                onChange={(_, checked) => {
                  setSkipSalesforce(checked);
                  if (checked) setSalesforceId('');
                }}
              />
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Number of Users" fieldId="number-of-users">
            <TextInput
              id="number-of-users"
              type="number"
              value={numberOfUsers}
              onChange={(_, value) => setNumberOfUsers(Math.max(1, parseInt(value) || 1))}
              min={1}
              style={{ maxWidth: '200px' }}
            />
          </FormGroup>

          <FormGroup label="Event Date" fieldId="event-date">
            <AutoStopDestroy
              type="auto-start"
              time={eventDate}
              onClick={() => {
                /* handled internally */
              }}
              isDisabled={false}
            />
          </FormGroup>

          <FormGroup label="Event End Date" fieldId="event-end-date">
            <AutoStopDestroy
              type="auto-destroy"
              time={eventEndDate}
              onClick={() => {
                /* handled internally */
              }}
              isDisabled={false}
            />
          </FormGroup>

          <FormGroup label="Notes for Operations" fieldId="notes">
            <TextArea
              id="notes"
              value={notes}
              onChange={(_, value) => setNotes(value)}
              placeholder="Provide any additional information, special requirements, or instructions for the operations team..."
              rows={5}
            />
          </FormGroup>

          <Button
            variant="primary"
            onClick={onSubmit}
            isDisabled={!isFormValid || isSubmitting}
            isLoading={isSubmitting}
            style={{ marginTop: '16px' }}
          >
            Submit Request
          </Button>
        </Form>
      </PageSection>

      <CatalogItemSelectorModal
        isOpen={isCatalogSelectorOpen}
        onClose={() => setIsCatalogSelectorOpen(false)}
        onSelect={handleCatalogItemSelect}
        title="Select Catalog Item for White Glove Request"
      />

      <Footer />
    </div>
  );
};

const WhiteGloveCreate: React.FC = () => (
  <ErrorBoundaryPage namespace="" name="" type="White Glove Request">
    <WhiteGloveCreateContent />
  </ErrorBoundaryPage>
);

export default WhiteGloveCreate;
