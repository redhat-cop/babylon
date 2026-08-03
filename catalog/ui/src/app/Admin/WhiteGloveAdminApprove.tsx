import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
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
  PageSection,
  Switch,
  TextInput,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import { apiPaths, fetcher, patchWhiteGloveRequest } from '@app/api';
import { WhiteGloveRequest } from '@app/types';
import { DEMO_DOMAIN } from '@app/util';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import ResourcePoolSelector from '@app/components/ResourcePoolSelector';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';

import '@app/Catalog/catalog-item-form.css';

const WhiteGloveAdminApproveContent: React.FC<{ namespace: string; name: string }> = ({ namespace, name }) => {
  const navigate = useNavigate();
  const { data: wgr } = useSWR<WhiteGloveRequest>(
    apiPaths.WHITE_GLOVE_REQUEST({ namespace, name }),
    fetcher,
  );

  const [workshopEnabled, setWorkshopEnabled] = useState(true);
  const [workshopName, setWorkshopName] = useState('');
  const [workshopPassword, setWorkshopPassword] = useState('');
  const [workshopCount, setWorkshopCount] = useState('');
  const [selectedResourcePool, setSelectedResourcePool] = useState('');
  const [useAutoDetach, setUseAutoDetach] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!wgr) return null;

  const requester = wgr.metadata.annotations?.[`${DEMO_DOMAIN}/requester`] || '—';
  const eventDate = wgr.spec.eventDate ? new Date(wgr.spec.eventDate).getTime() : Date.now();
  const eventEndDate = wgr.spec.eventEndDate ? new Date(wgr.spec.eventEndDate).getTime() : eventDate + 7 * 24 * 60 * 60 * 1000;

  async function handleApproveAndOrder() {
    setIsSubmitting(true);
    try {
      await patchWhiteGloveRequest({
        namespace,
        name,
        patch: { status: { state: 'approved', approvedAt: new Date().toISOString() } },
      });
      navigate(`/admin/white-glove-requests/${namespace}/${name}`);
    } catch {
      setIsSubmitting(false);
    }
  }

  return (
    <PageSection hasBodyWrapper={false} className="catalog-item-form">
      <Breadcrumb>
        <BreadcrumbItem><Link to="/admin/white-glove-requests">White Glove Requests</Link></BreadcrumbItem>
        <BreadcrumbItem><Link to={`/admin/white-glove-requests/${namespace}/${name}`}>{wgr.spec.displayName || wgr.metadata.name}</Link></BreadcrumbItem>
        <BreadcrumbItem isActive>Approve &amp; Order</BreadcrumbItem>
      </Breadcrumb>
      <Title headingLevel="h1" size="lg">
        Approve &amp; Order: {wgr.spec.displayName || wgr.metadata.name}
      </Title>
      <p>Review the prefilled details from the white glove request and order the workshop.</p>

      <Alert variant="info" isInline title={`White Glove Request from ${requester}`} style={{ marginBottom: 'var(--pf-t--global--spacer--md)', marginTop: 'var(--pf-t--global--spacer--md)' }}>
        <DescriptionList isHorizontal isCompact>
          {wgr.status?.jiraTicketId && (
            <DescriptionListGroup>
              <DescriptionListTerm>Jira</DescriptionListTerm>
              <DescriptionListDescription>
                <a href={wgr.status.jiraTicketUrl || '#'} target="_blank" rel="noopener noreferrer">
                  {wgr.status.jiraTicketId} &#8599;
                </a>
              </DescriptionListDescription>
            </DescriptionListGroup>
          )}
          {wgr.spec.notes && (
            <DescriptionListGroup>
              <DescriptionListTerm>Requester Notes</DescriptionListTerm>
              <DescriptionListDescription>{wgr.spec.notes}</DescriptionListDescription>
            </DescriptionListGroup>
          )}
        </DescriptionList>
      </Alert>

      <Form className="catalog-item-form__form">
        <FormGroup fieldId="aa-users-count" label="Number of Users" isRequired>
          <div className="catalog-item-form__group-control--single">
            <TextInput
              id="aa-users-count"
              type="number"
              value={workshopCount || String(wgr.spec.numberOfUsers || '')}
              onChange={(_e, v) => setWorkshopCount(v)}
              style={{ maxWidth: 'var(--babylon-form-width, 300px)' }}
            />
          </div>
        </FormGroup>

        <FormGroup fieldId="aa-workshop-switch">
          <div className="catalog-item-form__group-control--single">
            <Switch
              id="aa-workshop-switch"
              aria-label="Enable workshop user interface"
              label="Enable workshop user interface"
              isChecked={workshopEnabled}
              hasCheckIcon
              onChange={(_e, checked) => setWorkshopEnabled(checked)}
            />
            <Tooltip position="right" isContentLeftAligned content={
              <ul>
                <li>- Provision independent services for each attendee in the workshop.</li>
                <li>- Setup a user interface for the attendees to access their credentials.</li>
              </ul>
            }>
              <OutlinedQuestionCircleIcon aria-label="Workshop info" className="tooltip-icon-only" />
            </Tooltip>
          </div>
        </FormGroup>

        {workshopEnabled && (
          <div className="catalog-item-form__workshop-section">
            <div className="catalog-item-form__workshop-section-title">Workshop Settings</div>
            <FormGroup fieldId="aa-ws-name" label="Workshop Display Name" isRequired>
              <TextInput
                id="aa-ws-name"
                value={workshopName || wgr.spec.displayName || ''}
                onChange={(_e, v) => setWorkshopName(v)}
                style={{ maxWidth: 'var(--babylon-form-width, 300px)' }}
              />
            </FormGroup>
            <FormGroup fieldId="aa-ws-password" label="Access Password" isRequired>
              <TextInput
                id="aa-ws-password"
                value={workshopPassword}
                onChange={(_e, v) => setWorkshopPassword(v)}
                placeholder="Enter access password"
                style={{ maxWidth: 'var(--babylon-form-width, 300px)' }}
              />
            </FormGroup>
            <FormGroup fieldId="aa-ws-count" label="Number of Instances" isRequired>
              <TextInput
                id="aa-ws-count"
                type="number"
                value={workshopCount || String(wgr.spec.numberOfUsers || '')}
                onChange={(_e, v) => setWorkshopCount(v)}
                style={{ maxWidth: 'var(--babylon-form-width, 300px)' }}
              />
            </FormGroup>
          </div>
        )}

        <FormGroup fieldId="aa-start" isRequired label="Start Provisioning Date">
          <div className="catalog-item-form__group-control--single">
            <AutoStopDestroy
              type="auto-start"
              onClick={() => undefined}
              className="catalog-item-form__auto-stop-btn"
              time={eventDate}
              variant="extended"
              destroyTimestamp={eventEndDate}
            />
          </div>
        </FormGroup>

        <FormGroup fieldId="aa-destroy" label="Auto-destroy">
          <div className="catalog-item-form__group-control--single">
            <AutoStopDestroy
              type="auto-destroy"
              onClick={() => undefined}
              className="catalog-item-form__auto-destroy-btn"
              time={eventEndDate}
              variant="extended"
              destroyTimestamp={eventEndDate}
            />
          </div>
        </FormGroup>

        <div className="catalog-item-form__admin-section">
          <div className="catalog-item-form__admin-section-title">Admin Settings</div>
          <FormGroup fieldId="aa-resource-pool" label="Resource Pool">
            <div className="catalog-item-form__group-control--single">
              <ResourcePoolSelector
                disableAutoSelect
                selectedPool={selectedResourcePool}
                onSelect={setSelectedResourcePool}
              />
              <Tooltip position="right" content={<p>Select a specific resource pool to use for provisioning.</p>}>
                <OutlinedQuestionCircleIcon aria-label="Resource pool" className="tooltip-icon-only" />
              </Tooltip>
            </div>
          </FormGroup>
          <div className="catalog-item-form__group-control--single">
            <Switch
              id="aa-auto-detach"
              aria-label="Keep instance if provision fails"
              label="Keep instance if provision fails"
              isChecked={!useAutoDetach}
              hasCheckIcon
              onChange={(_e, checked) => setUseAutoDetach(!checked)}
            />
          </div>
        </div>

        <ActionList style={{ marginTop: 'var(--pf-t--global--spacer--lg)' }}>
          <ActionListItem>
            <Button variant="primary" onClick={handleApproveAndOrder} isDisabled={isSubmitting} isLoading={isSubmitting}>
              Approve &amp; Order
            </Button>
          </ActionListItem>
          <ActionListItem>
            <Button variant="link" component="a" href={`/admin/white-glove-requests/${namespace}/${name}`}>
              Back to Review
            </Button>
          </ActionListItem>
        </ActionList>
      </Form>
    </PageSection>
  );
};

const WhiteGloveAdminApprove: React.FC = () => {
  const { namespace, name } = useParams();
  return (
    <ErrorBoundaryPage namespace={namespace} name={name} type="White Glove Request">
      <WhiteGloveAdminApproveContent namespace={namespace} name={name} />
    </ErrorBoundaryPage>
  );
};

export default WhiteGloveAdminApprove;
