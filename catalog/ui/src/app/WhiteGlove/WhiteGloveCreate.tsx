import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWRImmutable from 'swr/immutable';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Checkbox,
  Form,
  FormGroup,
  Label,
  LabelGroup,
  MenuToggle,
  MenuToggleElement,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  TextArea,
  TextInput,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import { apiPaths, BlockedDateRange, createWhiteGloveRequest, createJiraTicketForWgr, patchWhiteGloveRequest, silentFetcher } from '@app/api';
import useSystemStatus from '@app/utils/useSystemStatus';
import { CatalogItem, SalesforceItem } from '@app/types';
import { DEMO_DOMAIN, displayName, getPurposeOptsFromCatalogItem } from '@app/util';
import { getSLA, SLAs } from '@app/Catalog/catalog-utils';
import CatalogItemIcon from '@app/Catalog/CatalogItemIcon';
import CatalogItemSelectorModal from '@app/components/CatalogItemSelectorModal';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import { DateTimePickerModalDialog, DateTimePickerButton } from '@app/components/DateTimePickerModal';
import { getBrowserTimezone } from '@app/components/timezones';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import PatientNumberInput from '@app/components/PatientNumberInput';
import SalesforceItemsField from '@app/components/SalesforceItemsField';
import useSession from '@app/utils/useSession';
import '@app/Catalog/catalog-item-form.css';
import './white-glove.css';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function createBlockedDateValidator(blockedDates: BlockedDateRange[]): (date: Date) => boolean {
  return (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return !blockedDates.some((range) => dateStr >= range.startDate && dateStr <= range.endDate);
  };
}

const WhiteGloveCreateContent: React.FC = () => {
  const navigate = useNavigate();
  const { userNamespace, catalogNamespaces } = useSession().getSession();
  const { wgBlockedDates } = useSystemStatus();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCatalogSelectorOpen, setIsCatalogSelectorOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [eventName, setEventName] = useState('');
  const [needConsultation, setNeedConsultation] = useState(false);
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<CatalogItem[]>([]);
  const [activity, setActivity] = useState('');
  const [purpose, setPurpose] = useState('');
  const [explanation, setExplanation] = useState('');
  const [salesforceItems, setSalesforceItems] = useState<SalesforceItem[]>([]);
  const [numberOfUsers, setNumberOfUsers] = useState<number>(1);
  const [timezone] = useState(getBrowserTimezone);
  const [eventDate, setEventDate] = useState<Date>(() => new Date(Date.now() + 15 * 24 * 60 * 60 * 1000));
  const [eventEndDate, setEventEndDate] = useState<Date>(() => new Date(Date.now() + 16 * 24 * 60 * 60 * 1000));
  const [isStartDateModalOpen, setIsStartDateModalOpen] = useState(false);
  const [isEndDateModalOpen, setIsEndDateModalOpen] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState('');
  const [isDeliveryModeOpen, setIsDeliveryModeOpen] = useState(false);
  const [audienceType, setAudienceType] = useState('');
  const [isAudienceTypeOpen, setIsAudienceTypeOpen] = useState(false);
  const [shareWith, setShareWith] = useState<string[]>([]);
  const [shareWithInput, setShareWithInput] = useState('');
  const [notes, setNotes] = useState('');

  const blockedDateValidator = useMemo(() => createBlockedDateValidator(wgBlockedDates), [wgBlockedDates]);

  const isShortLeadTime = eventDate.getTime() - Date.now() < FOURTEEN_DAYS_MS;

  const defaultCatalogNamespace = catalogNamespaces?.[0]?.name;
  const { data: defaultCatalogItems } = useSWRImmutable(
    defaultCatalogNamespace ? apiPaths.CATALOG_ITEMS({ namespace: defaultCatalogNamespace, limit: 1 }) : null,
    silentFetcher,
  );

  const purposeOpts = useMemo(() => {
    for (const item of selectedCatalogItems) {
      const opts = getPurposeOptsFromCatalogItem(item);
      if (opts.length > 0) return opts;
    }
    if (defaultCatalogItems?.items?.[0]) {
      return getPurposeOptsFromCatalogItem(defaultCatalogItems.items[0]);
    }
    return [];
  }, [selectedCatalogItems, defaultCatalogItems]);

  const catalogItemsFilter = useCallback(
    (items: CatalogItem[]) => items.filter((item) => getSLA(item) !== SLAs.Unsupported),
    [],
  );

  function handleCatalogItemSelect(catalogItemOrItems: CatalogItem | CatalogItem[]) {
    const items = Array.isArray(catalogItemOrItems) ? catalogItemOrItems : [catalogItemOrItems];
    if (items.length > 0) {
      setSelectedCatalogItems((prev) => {
        const existingKeys = new Set(prev.map((i) => `${i.metadata.namespace}/${i.metadata.name}`));
        const newItems = items.filter((i) => !existingKeys.has(`${i.metadata.namespace}/${i.metadata.name}`));
        return [...prev, ...newItems];
      });
    }
    setIsCatalogSelectorOpen(false);
  }

  function removeCatalogItem(index: number) {
    setSelectedCatalogItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addShareWithEmail() {
    const email = shareWithInput.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (shareWith.includes(email)) return;
    setShareWith((prev) => [...prev, email]);
    setShareWithInput('');
  }

  async function onSubmit(): Promise<void> {
    if (!userNamespace) return;
    if (!needConsultation && selectedCatalogItems.length === 0) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const hasCatalogItems = selectedCatalogItems.length > 0;
      const wgrData = {
        catalogItemNames: hasCatalogItems ? selectedCatalogItems.map((item) => item.metadata.name) : undefined,
        catalogItemNamespace: hasCatalogItems ? selectedCatalogItems[0].metadata.namespace : undefined,
        displayName: eventName,
        purpose,
        activity,
        explanation: explanation || undefined,
        numberOfUsers,
        eventDate: eventDate.toISOString(),
        eventEndDate: eventEndDate.toISOString(),
        notes: notes || undefined,
        salesforceItems: salesforceItems.length > 0 ? salesforceItems : undefined,
        shareWith: shareWith.length > 0 ? shareWith : undefined,
        deliveryMode: deliveryMode || undefined,
        audienceType: audienceType || undefined,
      };
      const result = await createWhiteGloveRequest({
        ...wgrData,
        namespace: userNamespace.name,
      });

      try {
        const jiraTicket = await createJiraTicketForWgr(wgrData);
        await patchWhiteGloveRequest({
          name: result.metadata.name,
          namespace: result.metadata.namespace,
          patch: {
            metadata: {
              annotations: {
                [`${DEMO_DOMAIN}/jira-ticket-id`]: jiraTicket.key,
                [`${DEMO_DOMAIN}/jira-ticket-url`]: jiraTicket.url,
              },
            },
          },
        });
      } catch (jiraError) {
        console.warn('Failed to create Jira ticket for WGR:', jiraError);
      }

      navigate(`/white-glove/${result.metadata.namespace}/${result.metadata.name}`, {
        state: { justCreated: true },
      });
    } catch (error) {
      console.error('Error creating white glove request:', error);
      setSubmitError('Failed to submit white glove request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const isFormValid = !!eventName.trim() && (needConsultation || selectedCatalogItems.length > 0) && !!activity && !!purpose && !!deliveryMode && !!audienceType;

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

          <FormGroup label="Catalog Item" isRequired={!needConsultation} fieldId="catalog-item">
            {!needConsultation && (
              <>
                {selectedCatalogItems.length > 0 && (
                  <div className="wg-catalog-items">
                    {selectedCatalogItems.map((item, index) => (
                      <div key={`${item.metadata.namespace}/${item.metadata.name}`} className="wg-catalog-item">
                        <div className="wg-catalog-item__icon">
                          <CatalogItemIcon catalogItem={item} />
                        </div>
                        <span className="wg-catalog-item__name">{displayName(item)}</span>
                        <Button variant="plain" aria-label="Remove catalog item" onClick={() => removeCatalogItem(index)} className="wg-catalog-item__remove">
                          <TimesIcon />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="secondary" onClick={() => setIsCatalogSelectorOpen(true)}>
                  {selectedCatalogItems.length > 0 ? 'Change' : 'Select catalog item'}
                </Button>
              </>
            )}
            <Checkbox
              id="need-consultation"
              label="I'm not sure / Need consultation"
              description="Our operations team will help you choose the right catalog item."
              isChecked={needConsultation}
              onChange={(_e, checked) => {
                setNeedConsultation(checked);
                if (checked) setSelectedCatalogItems([]);
              }}
              className="wg-consultation-checkbox"
            />
          </FormGroup>

          <ActivityPurposeSelector
            value={{ purpose, activity, explanation }}
            purposeOpts={purposeOpts}
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

          <FormGroup
            label={
              <>
                Number of Users{' '}
                <Tooltip content="Expected number of attendees/participants">
                  <OutlinedQuestionCircleIcon className="tooltip-icon-only" />
                </Tooltip>
              </>
            }
            fieldId="number-of-users"
          >
            <PatientNumberInput
              min={1}
              max={999}
              value={numberOfUsers}
              onChange={(value) => setNumberOfUsers(value)}
              onChangeDelay={500}
            />
          </FormGroup>

          {wgBlockedDates.length > 0 && (
            <Alert variant="info" isInline title="Some dates are unavailable">
              <ul style={{ margin: 0, paddingLeft: '16px' }}>
                {wgBlockedDates.map((range, i) => (
                  <li key={i}>
                    {range.startDate === range.endDate
                      ? range.startDate
                      : `${range.startDate} to ${range.endDate}`}
                    {range.message ? ` — ${range.message}` : ''}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          <FormGroup label="Event Start Date" isRequired fieldId="event-date">
            <DateTimePickerButton date={eventDate} timezone={timezone} onClick={() => setIsStartDateModalOpen(true)} />
            {isShortLeadTime && (
              <Alert variant="warning" isInline isPlain title="Short Lead Time" style={{ marginTop: '8px' }}>
                Events typically require 2 weeks advance notice for proper preparation. Rush requests may be declined or
                have limited support availability.
              </Alert>
            )}
          </FormGroup>

          <FormGroup label="Event End Date" isRequired fieldId="event-end-date">
            <DateTimePickerButton date={eventEndDate} timezone={timezone} onClick={() => setIsEndDateModalOpen(true)} />
          </FormGroup>

          <FormGroup
            label={
              <>
                Event Delivery Mode{' '}
                <Tooltip content="Helps ops prepare infrastructure — on-site events may need VPN configs or specialized networking.">
                  <OutlinedQuestionCircleIcon className="tooltip-icon-only" />
                </Tooltip>
              </>
            }
            fieldId="delivery-mode"
            isRequired
          >
            <Select
              id="delivery-mode"
              isOpen={isDeliveryModeOpen}
              onOpenChange={setIsDeliveryModeOpen}
              onSelect={(_e, value) => {
                setDeliveryMode(value as string);
                setIsDeliveryModeOpen(false);
              }}
              selected={deliveryMode || undefined}
              toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                <MenuToggle
                  ref={toggleRef}
                  onClick={() => setIsDeliveryModeOpen((prev) => !prev)}
                  isExpanded={isDeliveryModeOpen}
                  style={{ width: '100%' }}
                >
                  {deliveryMode
                    ? { virtual: 'Virtual', 'on-site': 'On-site', hybrid: 'Hybrid' }[deliveryMode]
                    : 'Select delivery mode...'}
                </MenuToggle>
              )}
            >
              <SelectList>
                <SelectOption value="virtual">Virtual</SelectOption>
                <SelectOption value="on-site">On-site</SelectOption>
                <SelectOption value="hybrid">Hybrid</SelectOption>
              </SelectList>
            </Select>
          </FormGroup>

          <FormGroup
            label={
              <>
                Audience Type{' '}
                <Tooltip content="External customer events get priority ops support. Internal/partner events may use different auth configurations.">
                  <OutlinedQuestionCircleIcon className="tooltip-icon-only" />
                </Tooltip>
              </>
            }
            fieldId="audience-type"
            isRequired
          >
            <Select
              id="audience-type"
              isOpen={isAudienceTypeOpen}
              onOpenChange={setIsAudienceTypeOpen}
              onSelect={(_e, value) => {
                setAudienceType(value as string);
                setIsAudienceTypeOpen(false);
              }}
              selected={audienceType || undefined}
              toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                <MenuToggle
                  ref={toggleRef}
                  onClick={() => setIsAudienceTypeOpen((prev) => !prev)}
                  isExpanded={isAudienceTypeOpen}
                  style={{ width: '100%' }}
                >
                  {audienceType
                    ? { 'external-customers': 'External Customers', 'internal-redhat': 'Internal Red Hat', partners: 'Partners' }[audienceType]
                    : 'Select audience type...'}
                </MenuToggle>
              )}
            >
              <SelectList>
                <SelectOption value="external-customers">External Customers</SelectOption>
                <SelectOption value="internal-redhat">Internal Red Hat</SelectOption>
                <SelectOption value="partners">Partners</SelectOption>
              </SelectList>
            </Select>
          </FormGroup>

          <FormGroup
            label={
              <>
                Share Service With{' '}
                <Tooltip content="Grant other users access to this service by adding their email addresses.">
                  <OutlinedQuestionCircleIcon className="tooltip-icon-only" />
                </Tooltip>
              </>
            }
            fieldId="share-with"
          >
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <TextInput
                id="share-with"
                value={shareWithInput}
                onChange={(_e, value) => setShareWithInput(value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addShareWithEmail();
                  }
                }}
                placeholder="Enter email address"
                style={{ flex: 1 }}
              />
              <Button
                variant="secondary"
                aria-label="Add email"
                onClick={addShareWithEmail}
                isDisabled={!shareWithInput.trim()}
                size="sm"
              >
                Add
              </Button>
            </div>
            {shareWith.length > 0 && (
              <LabelGroup style={{ marginTop: '8px' }}>
                {shareWith.map((email) => (
                  <Label
                    key={email}
                    onClose={() => setShareWith((prev) => prev.filter((e) => e !== email))}
                  >
                    {email}
                  </Label>
                ))}
              </LabelGroup>
            )}
          </FormGroup>

          <FormGroup label="Notes for Operations" fieldId="notes">
            <TextArea
              id="notes"
              value={notes}
              onChange={(_, value) => setNotes(value)}
              placeholder={`Special Requirements (optional)\nExamples:\n• "Attendees need VPN access to customer network"\n• "Demo requires GPU-enabled nodes"\n• "Need bastion host for customer security policy"\n• "Event has C-level executives - high visibility"`}
              rows={5}
            />
          </FormGroup>

          <Button
            variant="primary"
            onClick={onSubmit}
            isDisabled={!isFormValid || isSubmitting}
            isLoading={isSubmitting}
            style={{ marginTop: '16px', marginBottom: '48px', width: 'fit-content' }}
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
        defaultMultiSelect={false}
        catalogItemsFilter={catalogItemsFilter}
      />

      <DateTimePickerModalDialog
        isOpen={isStartDateModalOpen}
        date={eventDate}
        minDate={Date.now()}
        title="Event Start Date"
        additionalValidators={[blockedDateValidator]}
        onConfirm={(date) => {
          setEventDate(date);
          if (eventEndDate <= date) {
            setEventEndDate(new Date(date.getTime() + 24 * 60 * 60 * 1000));
          }
          setIsStartDateModalOpen(false);
        }}
        onClose={() => setIsStartDateModalOpen(false)}
      />

      <DateTimePickerModalDialog
        isOpen={isEndDateModalOpen}
        date={eventEndDate}
        minDate={eventDate.getTime()}
        title="Event End Date"
        additionalValidators={[blockedDateValidator]}
        onConfirm={(date) => {
          setEventEndDate(date);
          setIsEndDateModalOpen(false);
        }}
        onClose={() => setIsEndDateModalOpen(false)}
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
