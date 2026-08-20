import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import useSWRImmutable from 'swr/immutable';
import {
  ActionList,
  ActionListItem,
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Form,
  FormGroup,
  Label,
  LabelGroup,
  MenuToggle,
  MenuToggleElement,
  PageSection,
  ProgressStep,
  ProgressStepper,
  Radio,
  Select,
  SelectList,
  SelectOption,
  Split,
  SplitItem,
  Tab,
  Tabs,
  TabTitleText,
  TextArea,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { Modal as PFModal, ModalBody as PFModalBody, ModalFooter as PFModalFooter, ModalHeader as PFModalHeader } from '@patternfly/react-core';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import ClockIcon from '@patternfly/react-icons/dist/js/icons/clock-icon';
import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';
import { addJiraComment, apiPaths, fetcher, patchWhiteGloveRequest, silentFetcher, updateJiraLabels } from '@app/api';
import useDebounce from '@app/utils/useDebounce';
import { CatalogItem, MultiWorkshopList, SalesforceItem, WhiteGloveRequest, WorkshopList } from '@app/types';
import { BABYLON_DOMAIN, DEMO_DOMAIN, displayName, getPurposeOptsFromCatalogItem } from '@app/util';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import LocalTimestamp from '@app/components/LocalTimestamp';
import TimeInterval from '@app/components/TimeInterval';
import ProjectSelector from '@app/components/ProjectSelector';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import PatientNumberInput from '@app/components/PatientNumberInput';
import { DateTimePickerModalDialog, DateTimePickerButton } from '@app/components/DateTimePickerModal';
import { getBrowserTimezone } from '@app/components/timezones';
import CatalogItemIcon from '@app/Catalog/CatalogItemIcon';
import CatalogItemSelectorModal from '@app/components/CatalogItemSelectorModal';
import SalesforceItemsField from '@app/components/SalesforceItemsField';
import useSession from '@app/utils/useSession';
import './white-glove.css';

function stateLabel(state: string): string {
  switch (state) {
    case 'pending-approval': return 'Pending Approval';
    case 'approved': return 'Approved';
    case 'rejected': return 'Rejected';
    default: return state;
  }
}

function getBannerClass(state: string): string {
  return `wg-status-banner wg-status-banner--${state}`;
}

function getProgressVariant(stepState: string, currentState: string, hasService?: boolean): 'success' | 'danger' | 'pending' | 'info' {
  const stateOrder = ['pending-approval', 'approved'];
  const currentIndex = stateOrder.indexOf(currentState);

  if (currentState === 'rejected') {
    if (stepState === 'submitted' || stepState === 'pending-approval') return 'success';
    if (stepState === 'rejected') return 'danger';
    return 'pending';
  }

  if (stepState === 'service') {
    return hasService ? 'success' : 'pending';
  }

  if (stepState === 'approved') {
    return currentState === 'approved' ? 'success' : 'pending';
  }

  const stepMapping: Record<string, number> = {
    submitted: -1,
    'pending-approval': 0,
  };

  const stepIndex = stepMapping[stepState] ?? -1;
  if (stepIndex < currentIndex) return 'success';
  if (stepIndex === currentIndex) return 'info';
  return 'pending';
}

function isCurrent(stepState: string, currentState: string): boolean {
  if (currentState === 'rejected' && stepState === 'rejected') return true;
  if (currentState === 'approved' && stepState === 'approved') return true;
  return stepState === currentState;
}

const WhiteGloveDetailContent: React.FC = () => {
  const { namespace, name } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const justCreated = (location.state as { justCreated?: boolean })?.justCreated === true;
  const { isAdmin, catalogNamespaces } = useSession().getSession();
  const [activeTab, setActiveTab] = useState<string>('details');
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [slackChannel, setSlackChannel] = useState('');
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [approveChoice, setApproveChoice] = useState<'create-new' | 'link-existing'>('create-new');
  const [linkNamespace, setLinkNamespace] = useState<string>('');
  const [isLinkNamespaceOpen, setIsLinkNamespaceOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<string>('');
  const [isLinking, setIsLinking] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [serviceOptions, setServiceOptions] = useState<{ value: string; label: string; type: 'workshops' | 'multi-workshop' }[]>([]);

  const [isStartDateModalOpen, setIsStartDateModalOpen] = useState(false);
  const [isEndDateModalOpen, setIsEndDateModalOpen] = useState(false);
  const [isDeliveryModeOpen, setIsDeliveryModeOpen] = useState(false);
  const [isAudienceTypeOpen, setIsAudienceTypeOpen] = useState(false);
  const [shareWithInput, setShareWithInput] = useState('');
  const [timezone] = useState(getBrowserTimezone);
  const [isCatalogSelectorOpen, setIsCatalogSelectorOpen] = useState(false);
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogItemsFetched, setCatalogItemsFetched] = useState(false);

  const { data: wgr, mutate } = useSWR<WhiteGloveRequest>(
    namespace && name ? apiPaths.WHITE_GLOVE_REQUEST({ namespace, name }) : null,
    fetcher,
    { refreshInterval: 8000 },
  );

  const jiraTicketId = wgr?.metadata?.annotations?.[`${DEMO_DOMAIN}/jira-ticket-id`];

  const { data: jiraData } = useSWR(
    jiraTicketId ? apiPaths.JIRA_ISSUE({ issueKey: jiraTicketId }) : null,
    silentFetcher,
    { refreshInterval: 30000 },
  );

  useEffect(() => {
    if (!isAdmin || catalogItemsFetched || !wgr?.spec?.catalogItemNames?.length || !wgr?.spec?.catalogItemNamespace) return;
    setCatalogItemsFetched(true);
    Promise.all(
      wgr.spec.catalogItemNames.map((itemName) =>
        silentFetcher(apiPaths.CATALOG_ITEM({ namespace: wgr.spec.catalogItemNamespace, name: itemName })) as Promise<CatalogItem | null>,
      ),
    ).then((items) => {
      const valid = items.filter(Boolean) as CatalogItem[];
      if (valid.length > 0) setSelectedCatalogItems(valid);
    });
  }, [isAdmin, wgr, catalogItemsFetched]);

  const defaultCatalogNamespace = catalogNamespaces?.[0]?.name;
  const { data: defaultCatalogItems } = useSWRImmutable(
    selectedCatalogItems.length === 0 && defaultCatalogNamespace
      ? apiPaths.CATALOG_ITEMS({ namespace: defaultCatalogNamespace, limit: 1 })
      : null,
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

  const hasCatalogItems = wgr?.spec?.catalogItemNames?.length > 0;
  const isMultiCatalogItem = wgr?.spec?.catalogItemNames?.length > 1;

  const loadServicesForNamespace = useCallback(async (ns: string) => {
    setIsLoadingServices(true);
    setServiceOptions([]);
    try {
      const [workshopsRes, multiWorkshopsRes] = await Promise.all([
        silentFetcher(apiPaths.WORKSHOPS({ namespace: ns })) as Promise<WorkshopList | null>,
        silentFetcher(apiPaths.MULTIWORKSHOPS({ namespace: ns })) as Promise<MultiWorkshopList | null>,
      ]);
      const opts: { value: string; label: string; type: 'workshops' | 'multi-workshop' }[] = [];
      for (const mw of multiWorkshopsRes?.items || []) {
        opts.push({
          value: `multi-workshop:${mw.metadata.namespace}/${mw.metadata.name}`,
          label: mw.spec.displayName || mw.metadata.name,
          type: 'multi-workshop',
        });
      }
      const standaloneWorkshops = (workshopsRes?.items || []).filter(
        (w) => !w.metadata.labels?.[`${BABYLON_DOMAIN}/multiworkshop`],
      );
      for (const w of standaloneWorkshops) {
        opts.push({
          value: `workshops:${w.metadata.namespace}/${w.metadata.name}`,
          label: w.spec.displayName || w.metadata.name,
          type: 'workshops',
        });
      }
      setServiceOptions(opts);
    } catch {
      setServiceOptions([]);
    } finally {
      setIsLoadingServices(false);
    }
  }, []);

  function openApproveModal() {
    setApproveChoice(hasCatalogItems ? 'create-new' : 'link-existing');
    setLinkNamespace('');
    setSelectedService('');
    setServiceOptions([]);
    setIsApproveModalOpen(true);
  }

  function closeApproveModal() {
    setIsApproveModalOpen(false);
  }

  function updateLabelsForApproval() {
    const ticketId = wgr?.metadata?.annotations?.[`${DEMO_DOMAIN}/jira-ticket-id`];
    if (ticketId) {
      updateJiraLabels(ticketId, ['whiteglove-approved'], ['whiteglove-pending']).catch(() => {});
    }
  }

  function handleApproveConfirm() {
    if (approveChoice === 'create-new') {
      closeApproveModal();
      updateLabelsForApproval();
      const url = isMultiCatalogItem
        ? `/multi-workshop/create?wgr=${namespace}/${name}`
        : `/catalog/${wgr.spec.catalogItemNamespace}/order/${wgr.spec.catalogItemNames?.[0]}?wgr=${namespace}/${name}`;
      navigate(url);
      return;
    }
    if (!selectedService) return;
    const [type, nsName] = selectedService.split(':');
    const [svcNamespace, svcName] = nsName.split('/');
    setIsLinking(true);
    patchWhiteGloveRequest({
      namespace,
      name,
      patch: {
        metadata: {
          annotations: {
            [`${DEMO_DOMAIN}/state`]: 'approved',
            [`${DEMO_DOMAIN}/approved-at`]: new Date().toISOString(),
            [`${DEMO_DOMAIN}/service-name`]: svcName,
            [`${DEMO_DOMAIN}/service-namespace`]: svcNamespace,
            [`${DEMO_DOMAIN}/service-type`]: type,
          },
        },
      },
    })
      .then((updated) => {
        mutate(updated, false);
        closeApproveModal();
        updateLabelsForApproval();
      })
      .catch((err) => {
        console.error('Failed to link existing service:', err);
      })
      .finally(() => setIsLinking(false));
  }

  if (!wgr) {
    return (
      <PageSection>
        <Title headingLevel="h1" size="2xl">Loading...</Title>
      </PageSection>
    );
  }

  const ann = wgr.metadata.annotations || {};
  const state = ann[`${DEMO_DOMAIN}/state`] || 'pending-approval';
  const isRejected = state === 'rejected';
  const requester = ann[`${DEMO_DOMAIN}/requester`]
    || ann[`${BABYLON_DOMAIN}/created-by`]
    || '—';
  const jiraTicketUrl = ann[`${DEMO_DOMAIN}/jira-ticket-url`];
  const jiraAssignee = jiraData?.assignee;
  const jiraStatus = jiraData?.status;
  const jiraComments = jiraData?.comments || [];
  const assignee = jiraAssignee?.displayName || ann[`${DEMO_DOMAIN}/assignee`];
  const serviceName = ann[`${DEMO_DOMAIN}/service-name`];
  const serviceNamespace = ann[`${DEMO_DOMAIN}/service-namespace`];
  const serviceType = ann[`${DEMO_DOMAIN}/service-type`] || 'services';

  const listPath = isAdmin ? '/admin/white-glove-requests' : '/white-glove';

  async function handleReject() {
    const updated = await patchWhiteGloveRequest({
      namespace,
      name,
      patch: {
        metadata: {
          annotations: {
            [`${DEMO_DOMAIN}/state`]: 'rejected',
            [`${DEMO_DOMAIN}/rejection-reason`]: rejectReason,
            [`${DEMO_DOMAIN}/rejected-at`]: new Date().toISOString(),
          },
        },
      },
    });
    mutate(updated, false);
    setIsRejectModalOpen(false);
    const ticketId = wgr?.metadata?.annotations?.[`${DEMO_DOMAIN}/jira-ticket-id`];
    if (ticketId) {
      updateJiraLabels(ticketId, ['whiteglove-rejected'], ['whiteglove-pending']).catch(() => {});
    }
  }

  const jiraTicketIdForComment = wgr?.metadata?.annotations?.[`${DEMO_DOMAIN}/jira-ticket-id`];

  async function patchSpec(specPatch: Record<string, unknown>, commentLabel?: string) {
    const updated = await patchWhiteGloveRequest({ namespace, name, patch: { spec: specPatch } });
    mutate(updated, false);
    if (commentLabel && jiraTicketIdForComment) {
      addJiraComment(jiraTicketIdForComment, commentLabel).catch(() => {});
    }
  }

  const debouncedPatchSpec = useDebounce(
    (specPatch: Record<string, unknown>, commentLabel?: string) => patchSpec(specPatch, commentLabel),
    1000,
  );

  function addShareWithEmail() {
    const email = shareWithInput.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const current = wgr?.spec?.shareWith || [];
    if (current.includes(email)) return;
    const updated = [...current, email];
    setShareWithInput('');
    patchSpec({ shareWith: updated }, `Updated "Share With": added ${email}`);
  }

  function removeShareWithEmail(email: string) {
    const current = wgr?.spec?.shareWith || [];
    const updated = current.filter((e) => e !== email);
    patchSpec({ shareWith: updated.length > 0 ? updated : null }, `Updated "Share With": removed ${email}`);
  }

  function handleCatalogItemSelect(catalogItemOrItems: CatalogItem | CatalogItem[]) {
    const items = Array.isArray(catalogItemOrItems) ? catalogItemOrItems : [catalogItemOrItems];
    if (items.length > 0) {
      setSelectedCatalogItems(items);
      const names = items.map((i) => i.metadata.name);
      patchSpec(
        { catalogItemNames: names, catalogItemNamespace: items[0].metadata.namespace },
        `Updated "Catalog Item" to: ${names.join(', ')}`,
      );
    }
    setIsCatalogSelectorOpen(false);
  }

  function removeCatalogItemByIndex(index: number) {
    const current = selectedCatalogItems.length > 0 ? selectedCatalogItems : [];
    const currentNames = current.length > 0
      ? current.map((i) => i.metadata.name)
      : wgr?.spec?.catalogItemNames || [];
    const updated = currentNames.filter((_, i) => i !== index);
    if (current.length > 0) {
      setSelectedCatalogItems(current.filter((_, i) => i !== index));
    }
    patchSpec(
      { catalogItemNames: updated.length > 0 ? updated : null, catalogItemNamespace: updated.length > 0 ? (wgr?.spec?.catalogItemNamespace || null) : null },
      updated.length > 0 ? `Updated "Catalog Item" to: ${updated.join(', ')}` : 'Removed all catalog items',
    );
  }

  return (
    <>
      <PageSection variant="default">
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to={listPath}>White Glove Requests</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{wgr.spec.displayName || wgr.metadata.name}</BreadcrumbItem>
        </Breadcrumb>

        <Title headingLevel="h1" size="2xl" style={{ marginTop: '16px', marginBottom: '16px' }}>
          {wgr.spec.displayName || wgr.metadata.name}
        </Title>

        {justCreated && (
          <Alert variant="success" title="Request submitted successfully!" isInline style={{ marginBottom: '16px' }}>
            <p>Your request is pending ops review.</p>
            <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
              <li>Typical approval time: 24-48 hours</li>
              <li>Track progress via JSM ticket or Slack channel below</li>
              <li>Ops will reach out if more info needed</li>
            </ul>
          </Alert>
        )}

        <div className={getBannerClass(state)}>
          <Split hasGutter>
            <SplitItem isFilled>
              <div className="wg-status-banner__header">
                {state === 'pending-approval' && <ClockIcon className="wg-status-banner__icon" />}
                {state === 'approved' && <CheckCircleIcon className="wg-status-banner__icon" />}
                {isRejected && <ExclamationCircleIcon className="wg-status-banner__icon" />}
                <span className="wg-status-banner__state">{stateLabel(state)}</span>
              </div>
              <div className="wg-status-banner__meta">
                Submitted <TimeInterval toTimestamp={wgr.metadata.creationTimestamp} />
                {isAdmin && <> by <strong>{requester}</strong></>}
                {assignee && <> &middot; Assigned to <strong>{assignee}</strong></>}
              </div>
            </SplitItem>
            {jiraTicketId && (
              <SplitItem>
                <a href={jiraTicketUrl || '#'} target="_blank" rel="noopener noreferrer" className="wg-jira-link">
                  {jiraTicketId} &#8599;
                </a>
                {jiraStatus && (
                  <span className="wg-jira-status">{jiraStatus}</span>
                )}
              </SplitItem>
            )}
          </Split>
          <ProgressStepper className="wg-status-banner__stepper">
            <ProgressStep variant="success" id="step-submitted" titleId="step-submitted-t" aria-label="Submitted completed">Submitted</ProgressStep>
            <ProgressStep
              variant={getProgressVariant('pending-approval', state)}
              isCurrent={isCurrent('pending-approval', state)}
              id="step-pending" titleId="step-pending-t" aria-label="Pending Approval"
            >
              Pending Approval
            </ProgressStep>
            {isRejected ? (
              <ProgressStep variant="danger" isCurrent id="step-rejected" titleId="step-rejected-t" aria-label="Rejected">Rejected</ProgressStep>
            ) : (
              <>
                <ProgressStep
                  variant={getProgressVariant('approved', state)}
                  id="step-approved" titleId="step-approved-t" aria-label="Approved"
                >
                  Approved
                </ProgressStep>
                <ProgressStep
                  variant={getProgressVariant('service', state, !!(serviceName && serviceNamespace))}
                  id="step-service" titleId="step-service-t" aria-label="View Service"
                >
                  {serviceName && serviceNamespace ? (
                    <Link to={`/${serviceType}/${serviceNamespace}/${serviceName}`}>View Service</Link>
                  ) : (
                    'View Service'
                  )}
                </ProgressStep>
              </>
            )}
          </ProgressStepper>
          {isRejected && wgr.metadata.annotations?.[`${DEMO_DOMAIN}/rejection-reason`] && (
            <Alert variant="danger" isInline isPlain title="Reason" style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
              {wgr.metadata.annotations[`${DEMO_DOMAIN}/rejection-reason`]}
            </Alert>
          )}
        </div>

        {isAdmin && (state === 'pending-approval' || state === 'rejected') && (
          <ActionList style={{ marginBottom: 'var(--pf-t--global--spacer--lg)' }}>
            <ActionListItem>
              <Button
                variant="primary"
                onClick={openApproveModal}
              >
                Approve
              </Button>
            </ActionListItem>
            {state !== 'rejected' && (
            <ActionListItem>
              <Button variant="danger" onClick={() => setIsRejectModalOpen(true)}>Reject</Button>
            </ActionListItem>
            )}
          </ActionList>
        )}
      </PageSection>

      {isAdmin && (
        <PFModal isOpen={isRejectModalOpen} onClose={() => setIsRejectModalOpen(false)} variant="medium">
          <PFModalHeader title="Reject White Glove Request" />
          <PFModalBody>
            <p style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
              Provide a reason for rejecting the white glove request for <strong>{wgr.spec.displayName}</strong> from <strong>{requester}</strong>.
              The requester will be notified and the reason will be synced to the Jira ticket.
            </p>
            <FormGroup label="Reason for Rejection" isRequired fieldId="reject-reason">
              <TextArea
                id="reject-reason"
                placeholder="e.g. Resource capacity insufficient for the requested dates..."
                value={rejectReason}
                onChange={(_e, v) => setRejectReason(v)}
                rows={4}
              />
            </FormGroup>
          </PFModalBody>
          <PFModalFooter>
            <Button variant="danger" isDisabled={!rejectReason.trim()} onClick={handleReject}>Reject Request</Button>
            <Button variant="link" onClick={() => setIsRejectModalOpen(false)}>Cancel</Button>
          </PFModalFooter>
        </PFModal>
      )}

      {isAdmin && (
        <PFModal isOpen={isApproveModalOpen} onClose={closeApproveModal} variant="medium">
          <PFModalHeader title="Approve White Glove Request" />
          <PFModalBody>
            {!hasCatalogItems && (
              <Alert variant="info" isInline isPlain title="No catalog item was specified" style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
                The requester selected &quot;I&apos;m not sure / Need consultation&quot;. Select an existing workshop or multi-workshop to link to this request.
              </Alert>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pf-t--global--spacer--md)' }}>
              {hasCatalogItems && (
                <>
                  <Radio
                    id="approve-create-new"
                    name="approve-choice"
                    label={isMultiCatalogItem ? 'Create a new multi-workshop' : 'Create a new workshop'}
                    description="You will be redirected to the creation form with the request details pre-filled."
                    isChecked={approveChoice === 'create-new'}
                    onChange={() => {
                      setApproveChoice('create-new');
                      setSelectedService('');
                    }}
                  />
                  <Radio
                    id="approve-link-existing"
                    name="approve-choice"
                    label="Link to an existing workshop or multi-workshop"
                    description="Select a workshop or multi-workshop that was already created for this request."
                    isChecked={approveChoice === 'link-existing'}
                    onChange={() => setApproveChoice('link-existing')}
                  />
                </>
              )}
              {approveChoice === 'link-existing' && (
                <div style={{ paddingLeft: hasCatalogItems ? 'var(--pf-t--global--spacer--lg)' : '0', display: 'flex', flexDirection: 'column', gap: 'var(--pf-t--global--spacer--md)' }}>
                  <FormGroup label="Project" isRequired fieldId="link-namespace">
                    <ProjectSelector
                      currentNamespaceName={linkNamespace || undefined}
                      onSelect={(ns) => {
                        setLinkNamespace(ns.name);
                        setSelectedService('');
                        loadServicesForNamespace(ns.name);
                      }}
                    />
                  </FormGroup>
                  {linkNamespace && (
                    <FormGroup label="Workshop or Multi-Workshop" isRequired fieldId="link-service">
                      {isLoadingServices ? (
                        <p style={{ color: 'var(--pf-t--global--text--color--subtle)', fontStyle: 'italic' }}>
                          Loading...
                        </p>
                      ) : serviceOptions.length === 0 ? (
                        <p style={{ color: 'var(--pf-t--global--text--color--subtle)', fontStyle: 'italic' }}>
                          No standalone workshops or multi-workshops found in this project.
                        </p>
                      ) : (
                        <Select
                          id="link-service"
                          isOpen={isLinkNamespaceOpen}
                          onOpenChange={setIsLinkNamespaceOpen}
                          onSelect={(_e, value) => {
                            setSelectedService(value as string);
                            setIsLinkNamespaceOpen(false);
                          }}
                          selected={selectedService || undefined}
                          toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                            <MenuToggle
                              ref={toggleRef}
                              onClick={() => setIsLinkNamespaceOpen((prev) => !prev)}
                              isExpanded={isLinkNamespaceOpen}
                              style={{ width: '100%' }}
                            >
                              {selectedService
                                ? serviceOptions.find((o) => o.value === selectedService)?.label || 'Select...'
                                : 'Select a workshop or multi-workshop...'}
                            </MenuToggle>
                          )}
                        >
                          <SelectList>
                            {serviceOptions.map((opt) => (
                              <SelectOption key={opt.value} value={opt.value}>
                                {opt.label}
                                <span style={{ color: 'var(--pf-t--global--text--color--subtle)', marginLeft: '8px', fontSize: 'var(--pf-t--global--font--size--xs)' }}>
                                  ({opt.type === 'multi-workshop' ? 'Multi-Workshop' : 'Workshop'})
                                </span>
                              </SelectOption>
                            ))}
                          </SelectList>
                        </Select>
                      )}
                    </FormGroup>
                  )}
                </div>
              )}
            </div>
          </PFModalBody>
          <PFModalFooter>
            <Button
              variant="primary"
              isDisabled={(approveChoice === 'link-existing' && !selectedService) || isLinking}
              isLoading={isLinking}
              onClick={handleApproveConfirm}
            >
              {approveChoice === 'create-new' ? 'Continue' : 'Link & Approve'}
            </Button>
            <Button variant="link" onClick={closeApproveModal}>Cancel</Button>
          </PFModalFooter>
        </PFModal>
      )}

      <PageSection hasBodyWrapper={false} style={{ flexGrow: 1 }}>
        <Tabs activeKey={activeTab} onSelect={(_, tabIndex) => setActiveTab(tabIndex as string)}>
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            {activeTab === 'details' ? (
              <DescriptionList isHorizontal style={{ marginTop: '16px' }}>
                <DescriptionListGroup>
                  <DescriptionListTerm>Event Title</DescriptionListTerm>
                  <DescriptionListDescription>
                    <TextInput id="detail-displayName" className="wg-admin-input" value={wgr.spec.displayName || ''} isDisabled={!isAdmin}
                      onChange={(_e, v) => debouncedPatchSpec({ displayName: v }, `Updated "Event Title" to: ${v}`)} />
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Request Type</DescriptionListTerm>
                  <DescriptionListDescription><span className="wg-label">White Glove</span></DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Slack Channel</DescriptionListTerm>
                  <DescriptionListDescription>
                    <TextInput id="detail-slack" className="wg-admin-input" placeholder="e.g. #wg-rhel9-summit" isDisabled={!isAdmin}
                      value={slackChannel || wgr.spec.slackChannel || ''}
                      onChange={(_e, v) => { setSlackChannel(v); debouncedPatchSpec({ slackChannel: v }); }} />
                  </DescriptionListDescription>
                </DescriptionListGroup>

                {serviceName && serviceNamespace && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Service</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Button variant="primary" component="a" href={`/${serviceType}/${serviceNamespace}/${serviceName}`}>{serviceName} &#8599;</Button>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}

                <DescriptionListGroup>
                  <DescriptionListTerm>{wgr.spec.catalogItemNames?.length > 1 ? 'Catalog Items' : 'Catalog Item'}</DescriptionListTerm>
                  <DescriptionListDescription>
                    {selectedCatalogItems.length > 0 ? (
                      <div className="wg-catalog-items">
                        {selectedCatalogItems.map((item, index) => (
                          <div key={`${item.metadata.namespace}/${item.metadata.name}`} className="wg-catalog-item">
                            <div className="wg-catalog-item__icon"><CatalogItemIcon catalogItem={item} /></div>
                            <span className="wg-catalog-item__name">{displayName(item)}</span>
                            {isAdmin && (
                              <Button variant="plain" aria-label="Remove catalog item" onClick={() => removeCatalogItemByIndex(index)} className="wg-catalog-item__remove">
                                <TimesIcon />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : !hasCatalogItems ? (
                      <em style={{ color: 'var(--pf-t--global--text--color--subtle)', display: 'block', marginBottom: isAdmin ? '8px' : '0' }}>Not specified — needs consultation</em>
                    ) : null}
                    {isAdmin && (
                      <Button variant="secondary" size="sm" onClick={() => setIsCatalogSelectorOpen(true)}>
                        {(selectedCatalogItems.length > 0 || hasCatalogItems) ? 'Change' : 'Select catalog item'}
                      </Button>
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Requested By</DescriptionListTerm>
                  <DescriptionListDescription>{requester}</DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Requested On</DescriptionListTerm>
                  <DescriptionListDescription><TimeInterval toTimestamp={wgr.metadata.creationTimestamp} /></DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Jira Ticket</DescriptionListTerm>
                  <DescriptionListDescription>
                    {jiraTicketId ? <a href={jiraTicketUrl || '#'} target="_blank" rel="noopener noreferrer">{jiraTicketId} &#8599;</a> : '—'}
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Assignee</DescriptionListTerm>
                  <DescriptionListDescription>
                    {assignee || <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>Unassigned</span>}
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Activity &amp; Purpose</DescriptionListTerm>
                  <DescriptionListDescription>
                    {isAdmin ? (
                      <div className="hide-form-group-labels">
                        <ActivityPurposeSelector
                          value={{ purpose: wgr.spec.purpose, activity: wgr.spec.activity, explanation: wgr.spec.explanation }}
                          purposeOpts={purposeOpts}
                          onChange={(newActivity, newPurpose, newExplanation) => {
                            patchSpec(
                              { activity: newActivity || null, purpose: newPurpose || null, explanation: newExplanation || null },
                              `Updated "Activity" to: ${newActivity || '—'}, "Purpose" to: ${newPurpose || '—'}`,
                            );
                          }}
                        />
                      </div>
                    ) : (
                      <span>{wgr.spec.activity || '—'} / {wgr.spec.purpose || '—'}</span>
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Salesforce IDs</DescriptionListTerm>
                  <DescriptionListDescription>
                    {isAdmin ? (
                      <div className="wg-admin-input">
                        <SalesforceItemsField
                          fieldId="detail-salesforce"
                          standalone={false}
                          items={(wgr.spec.salesforceItems || []) as SalesforceItem[]}
                          onChange={(items) => patchSpec(
                            { salesforceItems: items.length > 0 ? items : null },
                            `Updated "Salesforce IDs"`,
                          )}
                        />
                      </div>
                    ) : (wgr.spec.salesforceItems?.length > 0 ? (
                      wgr.spec.salesforceItems.map((item) => `${item.id} (${item.type})`).join(', ')
                    ) : '—')}
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Event Start Date</DescriptionListTerm>
                  <DescriptionListDescription>
                    <DateTimePickerButton date={wgr.spec.eventDate ? new Date(wgr.spec.eventDate) : null} timezone={timezone}
                      placeholder="Not set" isDisabled={!isAdmin} onClick={() => setIsStartDateModalOpen(true)} />
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Event End Date</DescriptionListTerm>
                  <DescriptionListDescription>
                    <DateTimePickerButton date={wgr.spec.eventEndDate ? new Date(wgr.spec.eventEndDate) : null} timezone={timezone}
                      placeholder="Not set" isDisabled={!isAdmin} onClick={() => setIsEndDateModalOpen(true)} />
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Number of Users</DescriptionListTerm>
                  <DescriptionListDescription>
                    <PatientNumberInput min={1} max={999} value={wgr.spec.numberOfUsers || 1}
                      onChange={isAdmin ? (value) => debouncedPatchSpec({ numberOfUsers: value }, `Updated "Number of Users" to: ${value}`) : undefined}
                      onChangeDelay={500} />
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Event Delivery Mode</DescriptionListTerm>
                  <DescriptionListDescription>
                    <Select id="detail-delivery-mode" isOpen={isDeliveryModeOpen}
                      onOpenChange={setIsDeliveryModeOpen}
                      onSelect={(_e, value) => { setIsDeliveryModeOpen(false); patchSpec({ deliveryMode: value as string }, `Updated "Event Delivery Mode" to: ${value}`); }}
                      selected={wgr.spec.deliveryMode || undefined}
                      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                        <MenuToggle ref={toggleRef} onClick={() => isAdmin && setIsDeliveryModeOpen((prev) => !prev)}
                          isExpanded={isDeliveryModeOpen} isDisabled={!isAdmin} style={{ width: '200px' }}>
                          {wgr.spec.deliveryMode ? { virtual: 'Virtual', 'on-site': 'On-site', hybrid: 'Hybrid' }[wgr.spec.deliveryMode] : 'Not set'}
                        </MenuToggle>
                      )}>
                      <SelectList>
                        <SelectOption value="virtual">Virtual</SelectOption>
                        <SelectOption value="on-site">On-site</SelectOption>
                        <SelectOption value="hybrid">Hybrid</SelectOption>
                      </SelectList>
                    </Select>
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Audience Type</DescriptionListTerm>
                  <DescriptionListDescription>
                    <Select id="detail-audience-type" isOpen={isAudienceTypeOpen}
                      onOpenChange={setIsAudienceTypeOpen}
                      onSelect={(_e, value) => { setIsAudienceTypeOpen(false); patchSpec({ audienceType: value as string }, `Updated "Audience Type" to: ${value}`); }}
                      selected={wgr.spec.audienceType || undefined}
                      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                        <MenuToggle ref={toggleRef} onClick={() => isAdmin && setIsAudienceTypeOpen((prev) => !prev)}
                          isExpanded={isAudienceTypeOpen} isDisabled={!isAdmin} style={{ width: '200px' }}>
                          {wgr.spec.audienceType ? { 'external-customers': 'External Customers', 'internal-redhat': 'Internal Red Hat', partners: 'Partners' }[wgr.spec.audienceType] : 'Not set'}
                        </MenuToggle>
                      )}>
                      <SelectList>
                        <SelectOption value="external-customers">External Customers</SelectOption>
                        <SelectOption value="internal-redhat">Internal Red Hat</SelectOption>
                        <SelectOption value="partners">Partners</SelectOption>
                      </SelectList>
                    </Select>
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Shared With</DescriptionListTerm>
                  <DescriptionListDescription>
                    {isAdmin && (
                      <div className="wg-admin-input" style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: wgr.spec.shareWith?.length > 0 ? '8px' : '0' }}>
                        <TextInput id="detail-share-with" value={shareWithInput}
                          onChange={(_e, v) => setShareWithInput(v)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addShareWithEmail(); } }}
                          placeholder="Enter email address" style={{ flex: 1 }} />
                        <Button variant="secondary" size="sm" onClick={addShareWithEmail} isDisabled={!shareWithInput.trim()}>Add</Button>
                      </div>
                    )}
                    {wgr.spec.shareWith?.length > 0 ? (
                      <LabelGroup>
                        {wgr.spec.shareWith.map((email) => (
                          <Label key={email} {...(isAdmin ? { onClose: () => removeShareWithEmail(email) } : {})}>{email}</Label>
                        ))}
                      </LabelGroup>
                    ) : !isAdmin ? '—' : null}
                  </DescriptionListDescription>
                </DescriptionListGroup>

                <DescriptionListGroup>
                  <DescriptionListTerm>Notes</DescriptionListTerm>
                  <DescriptionListDescription>
                    <TextArea id="detail-notes" className="wg-admin-input" isDisabled={!isAdmin}
                      value={wgr.spec.notes || ''}
                      onChange={(_e, v) => debouncedPatchSpec({ notes: v || null }, `Updated "Notes"`)}
                      placeholder="Special requirements (optional)" rows={4} />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            ) : null}
          </Tab>
          <Tab eventKey="activity" title={<TabTitleText>Activity ({jiraComments.length})</TabTitleText>}>
            {activeTab === 'activity' ? (
              <div style={{ marginTop: '16px' }}>
                {jiraComments.length > 0 ? (
                  <div className="wg-comments-list">
                    {jiraComments.map((c: { author: string; body: string; created: string; updated: string }, i: number) => (
                      <div key={i} className="wg-comment">
                        <div className="wg-comment__header">
                          <strong>{c.author}</strong>
                          <span className="wg-comment__time">
                            <LocalTimestamp timestamp={c.created} />
                          </span>
                        </div>
                        <div className="wg-comment__body">{c.body}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--pf-t--global--text--color--subtle)', fontStyle: 'italic' }}>
                    No comments yet. Comments added in Jira will appear here.
                  </p>
                )}
              </div>
            ) : null}
          </Tab>
        </Tabs>
      </PageSection>

      {isAdmin && (
        <CatalogItemSelectorModal
          isOpen={isCatalogSelectorOpen}
          onClose={() => setIsCatalogSelectorOpen(false)}
          onSelect={handleCatalogItemSelect}
          title="Select Catalog Item"
          defaultMultiSelect={false}
        />
      )}

      {isAdmin && (
        <>
          <DateTimePickerModalDialog
            isOpen={isStartDateModalOpen}
            date={wgr.spec.eventDate ? new Date(wgr.spec.eventDate) : new Date()}
            minDate={0}
            title="Event Start Date"
            onConfirm={(date) => {
              patchSpec({ eventDate: date.toISOString() }, `Updated "Event Start Date" to: ${date.toISOString()}`);
              setIsStartDateModalOpen(false);
            }}
            onClose={() => setIsStartDateModalOpen(false)}
          />
          <DateTimePickerModalDialog
            isOpen={isEndDateModalOpen}
            date={wgr.spec.eventEndDate ? new Date(wgr.spec.eventEndDate) : new Date()}
            minDate={wgr.spec.eventDate ? new Date(wgr.spec.eventDate).getTime() : 0}
            title="Event End Date"
            onConfirm={(date) => {
              patchSpec({ eventEndDate: date.toISOString() }, `Updated "Event End Date" to: ${date.toISOString()}`);
              setIsEndDateModalOpen(false);
            }}
            onClose={() => setIsEndDateModalOpen(false)}
          />
        </>
      )}
    </>
  );
};

const WhiteGloveDetail: React.FC = () => {
  const { namespace, name } = useParams();
  return (
    <ErrorBoundaryPage namespace={namespace || ''} name={name || ''} type="White Glove Request">
      <WhiteGloveDetailContent />
    </ErrorBoundaryPage>
  );
};

export default WhiteGloveDetail;
