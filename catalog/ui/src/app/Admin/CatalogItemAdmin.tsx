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
  Select,
  SelectOption,
  SelectVariant,
  Split,
  SplitItem,
  TextArea,
  TextInput,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import { apiPaths, fetcher, patchK8sObjectByPath } from '@app/api';
import { CatalogItem } from '@app/types';
import { BABYLON_DOMAIN, displayName } from '@app/util';
import CatalogItemIcon from '@app/Catalog/CatalogItemIcon';
import { CUSTOM_LABELS, formatString, getProvider } from '@app/Catalog/catalog-utils';
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
export type Ops = {
  disabled: boolean;
  status: {
    id: string;
    updated: {
      author: string;
      updatedAt: string;
    };
  };
  incidentUrl?: string;
  jiraIssueId?: string;
  comments: comment[];
  updated: {
    author: string;
    updatedAt: string;
  };
};

const CatalogItemAdmin: React.FC = () => {
  const { namespace, name } = useParams();
  const navigate = useNavigate();
  const { data: catalogItem, mutate } = useSWR<CatalogItem>(apiPaths.CATALOG_ITEM({ namespace, name }), fetcher);
  const matchMutate = useMatchMutate();
  const { email: userEmail } = useSession().getSession();
  const [isReadOnlyValue, setIsReadOnlyValue] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const ops: Ops = catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`]
    ? JSON.parse(catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`])
    : null;
  const disabled = catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/${CUSTOM_LABELS.DISABLED.key}`]
    ? JSON.parse(catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/${CUSTOM_LABELS.DISABLED.key}`])
    : false;
  const [status, setStatus] = useState(ops?.status.id || 'operational');
  const [isDisabled, setIsDisabled] = useState(disabled);
  const [incidentUrl, setIncidentUrl] = useState(ops?.incidentUrl || '');
  const [jiraIssueId, setJiraIssueId] = useState(ops?.jiraIssueId || '');
  const [comment, setComment] = useState('');
  const provider = getProvider(catalogItem);

  useEffect(() => {
    if (status === 'operational') {
      setIsDisabled(false);
      setIsReadOnlyValue(true);
    } else if (status === 'major-outage') {
      setIsDisabled(true);
      setIsReadOnlyValue(true);
    } else {
      setIsReadOnlyValue(false);
    }
  }, [setIsReadOnlyValue, status]);

  async function removeComment(comment: comment) {
    if (!ops?.comments || ops.comments.length < 1) {
      throw "Can't find comment to delete";
    }
    const comments = ops.comments.filter((c) => c.createdAt !== comment.createdAt);
    const patch = {
      metadata: {
        annotations: { [`${BABYLON_DOMAIN}/ops`]: JSON.stringify({ ...ops, comments }) },
      },
    };
    setIsLoading(true);
    const catalogItemUpdated: CatalogItem = await patchK8sObjectByPath({
      path: apiPaths.CATALOG_ITEM({
        namespace,
        name,
      }),
      patch,
    });
    mutate(catalogItemUpdated);
    matchMutate([
      { name: 'CATALOG_ITEMS', arguments: { namespace: 'all-catalogs' }, data: undefined },
      { name: 'CATALOG_ITEMS', arguments: { namespace: catalogItemUpdated.metadata.namespace }, data: undefined },
    ]);
    setIsLoading(false);
  }
  async function saveForm() {
    const comments = ops?.comments || [];
    comment
      ? comments.push({
          message: comment,
          author: userEmail,
          createdAt: new Date().toISOString(),
        })
      : [];
    const patchObj = {
      status: {
        id: status,
        updated:
          ops?.status.id !== status ? { author: userEmail, updatedAt: new Date().toISOString() } : ops?.status.updated,
      },
      jiraIssueId,
      incidentUrl,
      updated: { author: userEmail, updatedAt: new Date().toISOString() },
      comments,
    };

    const patch = {
      metadata: {
        annotations: { [`${BABYLON_DOMAIN}/ops`]: JSON.stringify(patchObj) },
        labels: { [`${BABYLON_DOMAIN}/${CUSTOM_LABELS.DISABLED.key}`]: isDisabled.toString() },
      },
    };
    setIsLoading(true);
    const catalogItemUpdated: CatalogItem = await patchK8sObjectByPath({
      path: apiPaths.CATALOG_ITEM({
        namespace,
        name,
      }),
      patch,
    });
    mutate(catalogItemUpdated);
    matchMutate([
      { name: 'CATALOG_ITEMS', arguments: { namespace: 'all-catalogs' }, data: undefined },
      { name: 'CATALOG_ITEMS', arguments: { namespace: catalogItemUpdated.metadata.namespace }, data: undefined },
    ]);
    setIsLoading(false);
    navigate('/catalog');
  }

  return (
    <PageSection key="body" variant={PageSectionVariants.light}>
      {isLoading ? (
        <EmptyState variant="full" className="catalog-item-admin__loading">
          <EmptyStateIcon icon={LoadingIcon} />
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
                setStatus(value.toString());
                setIsOpen(false);
              }}
              onToggle={() => setIsOpen(!isOpen)}
              isOpen={isOpen}
              selections={status}
              variant={SelectVariant.single}
              className="select-wrapper"
            >
              <SelectOption key="operational" value="operational">
                <OperationalLogo /> Operational
              </SelectOption>
              <SelectOption key="degraded-performance" value="degraded-performance">
                <DegradedPerformanceLogo /> Degraded performance
              </SelectOption>
              <SelectOption key="partial-outage" value="partial-outage">
                <PartialOutageLogo /> Partial outage
              </SelectOption>
              <SelectOption key="major-outage" value="major-outage">
                <MajorOutageLogo /> Major outage
              </SelectOption>
              <SelectOption key="under-maintenance" value="under-maintenance">
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
          {ops ? (
            <p className="catalog-item-admin__author">
              Changed by: <b>{ops.status.updated.author} </b>-{' '}
              <LocalTimestamp className="catalog-item-admin__timestamp" timestamp={ops.status.updated.updatedAt} />
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
              onChange={(checked) => setIsDisabled(checked)}
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
            <TextInput type="text" id="incident" onChange={(v) => setIncidentUrl(v)} value={incidentUrl} />
            <Tooltip position="right" content={<div>StatusPage.io incident URL</div>}>
              <OutlinedQuestionCircleIcon aria-label="StatusPage.io incident URL" className="tooltip-icon-only" />
            </Tooltip>
          </div>
        </FormGroup>
        <FormGroup fieldId="jiraIssueId" label="Jira Issue Id (only visible to admins)">
          <div className="catalog-item-admin__group-control--single">
            <TextInput type="text" id="jiraIssueId" onChange={(v) => setJiraIssueId(v)} value={jiraIssueId} />
          </div>
        </FormGroup>
        <FormGroup fieldId="comment" label="Comments (only visible to admins)">
          <ul className="catalog-item-admin__comments">
            {(ops?.comments || []).map((comment) => (
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
            onChange={(v) => setComment(v)}
            value={comment}
            placeholder="Add comment"
            aria-label="Add comment"
            className="catalog-item-admin__add-comment"
          />
        </FormGroup>
        <ActionList>
          <ActionListItem>
            <Button isAriaDisabled={false} isDisabled={isLoading} onClick={saveForm}>
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
