import React, { useState } from 'react';
import { useHistory, useRouteMatch } from 'react-router-dom';
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
import { apiPaths, fetcher, patchK8sObjectByPath } from '@app/api';
import { CatalogItem } from '@app/types';
import { BABYLON_DOMAIN, displayName } from '@app/util';

import CatalogItemIcon from '@app/Catalog/CatalogItemIcon';
import { getProvider } from '@app/Catalog/catalog-utils';
import { OutlinedQuestionCircleIcon, TrashIcon } from '@patternfly/react-icons';
import OperationalLogo from '@app/components/StatusPageIcons/Operational';
import DegradedPerformanceLogo from '@app/components/StatusPageIcons/DegradedPerformance';
import PartialOutageLogo from '@app/components/StatusPageIcons/PartialOutage';
import MajorOutageLogo from '@app/components/StatusPageIcons/MajorOutage';
import UnderMaintenanceLogo from '@app/components/StatusPageIcons/UnderMaintenance';
import useSession from '@app/utils/useSession';
import LocalTimestamp from '@app/components/LocalTimestamp';
import LoadingIcon from '@app/components/LoadingIcon';

import './catalog-item-admin.css';

const CatalogItemAdmin: React.FC = () => {
  const routeMatch = useRouteMatch<{
    namespace: string;
    name: string;
  }>('/admin/catalogitems/:namespace/:name');
  const history = useHistory();
  const { data: catalogItem, mutate }: { data?: CatalogItem; mutate: any } = useSWR(
    apiPaths.CATALOG_ITEM({ namespace: routeMatch.params.namespace, name: routeMatch.params.name }),
    fetcher,
    { suspense: true }
  );
  const userEmail = useSession().getSession().email;

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const ops = catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`]
    ? JSON.parse(catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`])
    : {};
  const disabled = catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/disabled`]
    ? JSON.parse(catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/disabled`])
    : false;
  const [status, setStatus] = useState(ops.status || 'operational');
  const [isDisabled, setIsDisabled] = useState(disabled);
  const [incidentUrl, setIncidentUrl] = useState(ops.incidentUrl || '');
  const [identifier, setIdentifier] = useState(ops.identifier || '');
  const [comment, setComment] = useState('');
  const provider = getProvider(catalogItem);

  async function removeComment(comment) {
    if (!ops.comments || ops.comments.length < 1) {
      throw "Can't find comment to delete";
    }
    const comments = ops.comments.filter((c) => c.timestamp !== comment.timestamp);
    const patch = {
      metadata: {
        annotations: { [`${BABYLON_DOMAIN}/ops`]: JSON.stringify({ ...ops, comments }) },
      },
    };
    setIsLoading(true);
    mutate(
      await patchK8sObjectByPath({
        path: apiPaths.CATALOG_ITEM({
          namespace: routeMatch.params.namespace,
          name: routeMatch.params.name,
        }),
        patch,
      })
    );
    setIsLoading(false);
  }
  async function saveForm() {
    const comments = ops.comments || [];
    comment
      ? comments.push({
          message: comment,
          author: userEmail,
          timestamp: new Date().toISOString(),
        })
      : [];
    const patchObj = {
      status,
      identifier,
      incidentUrl,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: userEmail,
      comments,
    };

    const patch = {
      metadata: {
        annotations: { [`${BABYLON_DOMAIN}/ops`]: JSON.stringify(patchObj) },
        labels: { [`${BABYLON_DOMAIN}/disabled`]: isDisabled.toString() },
      },
    };
    setIsLoading(true);
    mutate(
      await patchK8sObjectByPath({
        path: apiPaths.CATALOG_ITEM({
          namespace: routeMatch.params.namespace,
          name: routeMatch.params.name,
        }),
        patch,
      })
    );
    setIsLoading(false);
    history.push('/catalog');
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
              provided by {provider}
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
            <Tooltip position="right" content={<div>StatusPage.io status</div>}>
              <OutlinedQuestionCircleIcon aria-label="StatusPage.io status" className="tooltip-icon-only" />
            </Tooltip>
          </div>
        </FormGroup>
        <FormGroup fieldId="disabled">
          <div className="catalog-item-admin__group-control--single">
            <Checkbox
              id="disabled"
              name="disabled"
              label="Disabled"
              isChecked={isDisabled}
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
        <FormGroup fieldId="identifier" label="Identifier (only visible to admins)">
          <div className="catalog-item-admin__group-control--single">
            <TextInput type="text" id="identifier" onChange={(v) => setIdentifier(v)} value={identifier} />
            <Tooltip position="right" content={<div>Person in contact</div>}>
              <OutlinedQuestionCircleIcon aria-label="Person in contact" className="tooltip-icon-only" />
            </Tooltip>
          </div>
        </FormGroup>
        <FormGroup fieldId="comment" label="Comments (only visible to admins)">
          <ul className="catalog-item-admin__comments">
            {(ops.comments || []).map((comment) => (
              <li key={comment.timestamp} className="catalog-item-admin__comment">
                <p className="catalog-item-admin__author">
                  <b>{comment.author} </b>-{' '}
                  <LocalTimestamp className="catalog-item-admin__timestamp" timestamp={comment.timestamp} />
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
            <Button variant="secondary" onClick={() => history.push(`/catalog`)}>
              Cancel
            </Button>
          </ActionListItem>
        </ActionList>
      </Form>
    </PageSection>
  );
};

export default CatalogItemAdmin;
