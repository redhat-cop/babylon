import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Form,
  FormGroup,
  PageSection,
  TextArea,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { createWhiteGloveRequest } from '@app/api';
import { CatalogItem, SalesforceItem } from '@app/types';
import { displayName } from '@app/util';
import CatalogItemSelectorModal from '@app/components/CatalogItemSelectorModal';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import DateTimePicker from '@app/components/DateTimePicker';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import PatientNumberInput from '@app/components/PatientNumberInput';
import SalesforceItemsField from '@app/components/SalesforceItemsField';
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

  const [eventName, setEventName] = useState('');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null);
  const [activity, setActivity] = useState('');
  const [purpose, setPurpose] = useState('');
  const [explanation, setExplanation] = useState('');
  const [salesforceItems, setSalesforceItems] = useState<SalesforceItem[]>([]);
  const [numberOfUsers, setNumberOfUsers] = useState<number>(1);
  const [eventDate, setEventDate] = useState<Date>(() => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
  const [eventEndDate, setEventEndDate] = useState<Date>(() => new Date(Date.now() + 15 * 24 * 60 * 60 * 1000));
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
        displayName: eventName,
        purpose,
        activity,
        explanation: explanation || undefined,
        numberOfUsers,
        eventDate: eventDate.toISOString(),
        eventEndDate: eventEndDate.toISOString(),
        notes: notes || undefined,
        salesforceItems: salesforceItems.length > 0 ? salesforceItems : undefined,
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

  const isFormValid = !!eventName.trim() && !!selectedCatalogItem && !!activity && !!purpose;

  return (
    <>
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
          <FormGroup label="Event Title" isRequired fieldId="event-name">
            <TextInput
              id="event-name"
              value={eventName}
              onChange={(_e, value) => setEventName(value)}
              placeholder="e.g. RHEL 9 Workshop — Summit 2026"
            />
          </FormGroup>

          <FormGroup label="Catalog Item" isRequired fieldId="catalog-item">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ minWidth: '400px' }}>
                <TextInput
                  id="catalog-item"
                  placeholder="Select a catalog item..."
                  value={selectedCatalogItem ? displayName(selectedCatalogItem) : ''}
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

          <SalesforceItemsField
            label={
              <span>
                Salesforce IDs{' '}
                <span
                  style={{
                    fontSize: 'var(--pf-t--global--font--size--xs)',
                    color: 'var(--pf-t--color--gray--60)',
                    fontStyle: 'italic',
                    fontWeight: 400,
                  }}
                >
                  (Opportunity ID, Campaign ID or Project ID)
                </span>
              </span>
            }
            fieldId="salesforce_id"
            items={salesforceItems}
            onChange={setSalesforceItems}
          />

          <FormGroup label="Number of Users" fieldId="number-of-users">
            <PatientNumberInput
              min={1}
              max={999}
              value={numberOfUsers}
              onChange={(value) => setNumberOfUsers(value)}
              onChangeDelay={500}
            />
          </FormGroup>

          <FormGroup label="Event Start Date" fieldId="event-date">
            <DateTimePicker
              defaultTimestamp={eventDate.getTime()}
              onSelect={(date: Date) => {
                setEventDate(date);
                if (eventEndDate <= date) {
                  setEventEndDate(new Date(date.getTime() + 24 * 60 * 60 * 1000));
                }
              }}
              minDate={Date.now()}
              forceUpdateTimestamp={eventDate.getTime()}
            />
          </FormGroup>

          <FormGroup label="Event End Date" fieldId="event-end-date">
            <DateTimePicker
              defaultTimestamp={eventEndDate.getTime()}
              onSelect={(date: Date) => setEventEndDate(date)}
              minDate={eventDate.getTime()}
              forceUpdateTimestamp={eventEndDate.getTime()}
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
            style={{ marginTop: '16px', width: 'fit-content' }}
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
        singleSelect
      />

    </>
  );
};

const WhiteGloveCreate: React.FC = () => (
  <ErrorBoundaryPage namespace="" name="" type="White Glove Request">
    <WhiteGloveCreateContent />
  </ErrorBoundaryPage>
);

export default WhiteGloveCreate;
