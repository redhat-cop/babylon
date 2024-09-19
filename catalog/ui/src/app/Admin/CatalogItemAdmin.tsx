import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import {
  ActionList,
  ActionListItem,
  Button,
  Checkbox,
  EmptyState,
  EmptyStateIcon,
  Form,
  FormGroup,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  TextArea,
  TextInput,
  Title,
  Tooltip,
  EmptyStateHeader,
} from '@patternfly/react-core';
import { Select, SelectOption, SelectVariant } from '@patternfly/react-core/deprecated';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import { apiPaths, fetcher } from '@app/api';
import { CatalogItem, CatalogItemIncident, CatalogItemIncidentStatus } from '@app/types';
import { displayName, getStageFromK8sObject } from '@app/util';
import CatalogItemIcon from '@app/Catalog/CatalogItemIcon';
import { formatString, getProvider } from '@app/Catalog/catalog-utils';
import OperationalLogo from '@app/components/StatusPageIcons/Operational';
import DegradedPerformanceLogo from '@app/components/StatusPageIcons/DegradedPerformance';
import PartialOutageLogo from '@app/components/StatusPageIcons/PartialOutage';
import MajorOutageLogo from '@app/components/StatusPageIcons/MajorOutage';
import UnderMaintenanceLogo from '@app/components/StatusPageIcons/UnderMaintenance';
import useSession from '@app/utils/useSession';
import LocalTimestamp from '@app/components/LocalTimestamp';
import LoadingIcon from '@app/components/LoadingIcon';
import useMatchMutate from '@app/utils/useMatchMutate';

import './catalog-item-admin.css';

type comment = {
  author: string;
  createdAt: string;
  message: string;
};

const CatalogItemAdmin: React.FC = () => {
  const { namespace, name } = useParams();
  const navigate = useNavigate();
  const { data: catalogItem } = useSWR<CatalogItem>(apiPaths.CATALOG_ITEM({ namespace, name }), fetcher);
  const stage = getStageFromK8sObject(catalogItem);
  const matchMutate = useMatchMutate();
  const asset_uuid = catalogItem.metadata.labels['gpte.redhat.com/asset-uuid'];
  const { data: catalogItemIncident, isLoading: isLoadingIncidents } = useSWR<CatalogItemIncident>(
    apiPaths.CATALOG_ITEM_LAST_INCIDENT({ stage, asset_uuid }),
    fetcher,
    {
      suspense: false,
      shouldRetryOnError: false,
    }
  );
  const { email: userEmail } = useSession().getSession();
  const [isReadOnlyValue, setIsReadOnlyValue] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Operational');
  const [isDisabled, setIsDisabled] = useState(false);
  const [incidentUrl, setIncidentUrl] = useState('');
  const [jiraIssueId, setJiraIssueId] = useState('');
  const [comment, setComment] = useState('');
  const provider = getProvider(catalogItem);

  useEffect(() => {
    if (status === 'Operational') {
      setIsDisabled(false);
      setIsReadOnlyValue(true);
      setJiraIssueId('');
      setIncidentUrl('');
    } else if (status === 'Major outage') {
      setIsDisabled(true);
      setIsReadOnlyValue(true);
    } else {
      setIsReadOnlyValue(false);
    }
  }, [setIsReadOnlyValue, status]);

  useEffect(() => {
    if (isLoadingIncidents === false) {
      setStatus(catalogItemIncident?.status || 'Operational');
      setIsDisabled(catalogItemIncident?.disabled ?? false);
      setIncidentUrl(catalogItemIncident?.incident_url || '');
      setJiraIssueId(catalogItemIncident?.jira_url || '');
    }
  }, [isLoadingIncidents]);

  async function removeComment(comment: comment) {
    if (!catalogItemIncident?.comments) {
      throw "Can't find comment to delete";
    }
    const comments = JSON.parse(catalogItemIncident.comments);
    if (comments.length < 1) {
      throw "Can't find comment to delete";
    }
    const new_comments = comments.filter((c: comment) => c.createdAt !== comment.createdAt);
    await saveForm(new_comments);
  }
  async function saveForm(comments?: comment[]) {
    setIsLoading(true);
    if (comments === null || comments === undefined) {
      comments = catalogItemIncident?.comments ? JSON.parse(catalogItemIncident.comments) : [];
    }
    if (comment) {
      comments.push({
        message: comment,
        author: userEmail,
        createdAt: new Date().toISOString(),
      });
    }

    await fetcher(apiPaths.CATALOG_ITEM_INCIDENTS({ asset_uuid, stage }), {
      method: 'POST',
      body: JSON.stringify({
        created_by: userEmail,
        disabled: isDisabled,
        status,
        incident_url: incidentUrl,
        jira_url: jiraIssueId,
        comments: JSON.stringify(comments),
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    matchMutate([
      { name: 'CATALOG_ITEMS_ACTIVE_INCIDENTS', arguments: { stage: null }, data: undefined },
      {
        name: 'CATALOG_ITEMS_ACTIVE_INCIDENTS',
        arguments: { stage: getStageFromK8sObject(catalogItem) },
        data: undefined,
      },
    ]);
    setIsLoading(false);
    navigate('/catalog');
  }

  return (
    <PageSection key="body" variant={PageSectionVariants.light}>
      {isLoading || isLoadingIncidents ? (
        <EmptyState variant="full" className="catalog-item-admin__loading">
          <EmptyStateHeader icon={<EmptyStateIcon icon={LoadingIcon} />} />
        </EmptyState>
      ) : null}
      <Split>
        <SplitItem className="catalog-item-admin__header-icon">
          <CatalogItemIcon catalogItem={catalogItem} />
        </SplitItem>
        <SplitItem isFilled className="catalog-item-admin__header-text">
          <Title className="catalog-item-admin__title" headingLevel="h1">
            {displayName(catalogItem)}
          </Title>
          {provider ? (
            <Title className="catalog-item-admin__subtitle" headingLevel="h4">
              provided by {formatString(provider)}
            </Title>
          ) : null}
        </SplitItem>
      </Split>
      <Form className="catalog-item-admin__form">
        <FormGroup fieldId="status" isRequired={true} label="Status">
          <div className="catalog-item-admin__group-control--single">
            <Select
              aria-label="StatusPage.io status"
              onSelect={(_, value) => {
                setStatus(value.toString() as CatalogItemIncidentStatus);
                setIsOpen(false);
              }}
              onToggle={() => setIsOpen(!isOpen)}
              isOpen={isOpen}
              selections={status}
              variant={SelectVariant.single}
              className="select-wrapper"
            >
              <SelectOption key="operational" value="Operational">
                <OperationalLogo /> Operational
              </SelectOption>
              <SelectOption key="degraded-performance" value="Degraded performance">
                <DegradedPerformanceLogo /> Degraded performance
              </SelectOption>
              <SelectOption key="partial-outage" value="Partial outage">
                <PartialOutageLogo /> Partial outage
              </SelectOption>
              <SelectOption key="major-outage" value="Major outage">
                <MajorOutageLogo /> Major outage
              </SelectOption>
              <SelectOption key="under-maintenance" value="Under maintenance">
                <UnderMaintenanceLogo /> Under maintenance
              </SelectOption>
            </Select>
            <Tooltip position="right" content={<div>Catalog Item status, should be the same as in StatusPage.io</div>}>
              <OutlinedQuestionCircleIcon
                aria-label="Catalog Item status, should be the same as in StatusPage.io"
                className="tooltip-icon-only"
              />
            </Tooltip>
          </div>
          {catalogItemIncident ? (
            <p className="catalog-item-admin__author">
              Changed by: <b>{catalogItemIncident.created_by} </b>-{' '}
              <LocalTimestamp className="catalog-item-admin__timestamp" timestamp={catalogItemIncident.created_at} />
            </p>
          ) : null}
        </FormGroup>
        <FormGroup fieldId="disabled">
          <div className="catalog-item-admin__group-control--single">
            <Checkbox
              id="disabled"
              name="disabled"
              label="Disabled"
              isChecked={isDisabled}
              isDisabled={isReadOnlyValue}
              onChange={(_event, checked) => setIsDisabled(checked)}
            />
            <Tooltip position="right" content={<div>Users will not be able to order this Catalog Item</div>}>
              <OutlinedQuestionCircleIcon
                aria-label="Users will not be able to order this Catalog Item"
                className="tooltip-icon-only"
              />
            </Tooltip>
          </div>
        </FormGroup>
        <FormGroup fieldId="incident" label="Incident URL">
          <div className="catalog-item-admin__group-control--single">
            <TextInput type="text" id="incident" onChange={(_event, v) => setIncidentUrl(v)} value={incidentUrl} />
            <Tooltip position="right" content={<div>StatusPage.io incident URL</div>}>
              <OutlinedQuestionCircleIcon aria-label="StatusPage.io incident URL" className="tooltip-icon-only" />
            </Tooltip>
          </div>
        </FormGroup>
        <FormGroup fieldId="jiraIssueId" label="Jira Issue Id (only visible to admins)">
          <div className="catalog-item-admin__group-control--single">
            <TextInput type="text" id="jiraIssueId" onChange={(_event, v) => setJiraIssueId(v)} value={jiraIssueId} />
          </div>
        </FormGroup>
        <FormGroup fieldId="comment" label="Comments (only visible to admins)">
          <ul className="catalog-item-admin__comments">
            {(catalogItemIncident?.comments ? JSON.parse(catalogItemIncident.comments) : []).map((comment: comment) => (
              <li key={comment.createdAt} className="catalog-item-admin__comment">
                <p className="catalog-item-admin__author">
                  <b>{comment.author} </b>-{' '}
                  <LocalTimestamp className="catalog-item-admin__timestamp" timestamp={comment.createdAt} />
                  <Button aria-label="Remove comment" onClick={() => removeComment(comment)} variant="plain">
                    <TrashIcon width={12} color="#6a6e73" />
                  </Button>
                </p>
                <p className="catalog-item-admin__message">{comment.message}</p>
              </li>
            ))}
          </ul>
          <TextArea
            id="comment"
            onChange={(_event, v) => setComment(v)}
            value={comment}
            placeholder="Add comment"
            aria-label="Add comment"
            className="catalog-item-admin__add-comment"
          />
        </FormGroup>
        <ActionList>
          <ActionListItem>
            <Button isAriaDisabled={false} isDisabled={isLoading} onClick={() => saveForm()}>
              Save
            </Button>
          </ActionListItem>
          <ActionListItem>
            <Button variant="secondary" onClick={() => navigate(`/catalog`)}>
              Cancel
            </Button>
          </ActionListItem>
        </ActionList>
      </Form>
    </PageSection>
  );
};

export default CatalogItemAdmin;
