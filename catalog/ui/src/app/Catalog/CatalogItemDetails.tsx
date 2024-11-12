import React, { useMemo } from 'react';
import parseDuration from 'parse-duration';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  DrawerActions,
  DrawerCloseButton,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelContent,
  PageSection,
  PageSectionVariants,
  Sidebar,
  SidebarContent,
  SidebarPanel,
  Split,
  SplitItem,
  Title,
  Label,
  Tooltip,
} from '@patternfly/react-core';
import InfoAltIcon from '@patternfly/react-icons/dist/js/icons/info-alt-icon';
import useSWR from 'swr';
import { apiPaths, fetcher, fetcherItemsInAllPages } from '@app/api';
import { AssetMetrics, CatalogItem, CatalogItemIncident, ResourceClaim } from '@app/types';
import LoadingIcon from '@app/components/LoadingIcon';
import StatusPageIcons from '@app/components/StatusPageIcons';
import useSession from '@app/utils/useSession';
import {
  checkAccessControl,
  displayName,
  renderContent,
  BABYLON_DOMAIN,
  FETCH_BATCH_LIMIT,
  isLabDeveloper,
  isResourceClaimPartOfWorkshop,
  compareK8sObjectsArr,
  CATALOG_MANAGER_DOMAIN,
  getStageFromK8sObject,
  calculateUptimePercentage,
} from '@app/util';
import StarRating from '@app/components/StarRating';
import TimeInterval from '@app/components/TimeInterval';
import ShareLink from '@app/components/ShareLink';
import {
  getProvider,
  getDescription,
  formatTime,
  getStatus,
  HIDDEN_LABELS_DETAIL_VIEW,
  formatString,
  getRating,
  CUSTOM_LABELS,
  sortLabels,
  formatCurrency,
  getLastSuccessfulProvisionTime,
} from './catalog-utils';
import CatalogItemIcon from './CatalogItemIcon';
import CatalogItemHealthDisplay from './CatalogItemHealthDisplay';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import useHelpLink from '@app/utils/useHelpLink';
import useSWRImmutable from 'swr/immutable';

import './catalog-item-details.css';
import UptimeDisplay from '@app/components/UptimeDisplay';

enum CatalogItemAccess {
  Allow,
  Deny,
  RequestInformation,
}

const CatalogItemDetails: React.FC<{ catalogItem: CatalogItem; onClose: () => void }> = ({ catalogItem, onClose }) => {
  const navigate = useNavigate();
  const { userNamespace, isAdmin, groups } = useSession().getSession();
  const { accessControl, lastUpdate } = catalogItem.spec;
  const { labels, namespace, name } = catalogItem.metadata;
  const stage = getStageFromK8sObject(catalogItem);
  const provider = getProvider(catalogItem);
  const catalogItemName = displayName(catalogItem);
  const { description, descriptionFormat } = getDescription(catalogItem);
  const lastSuccessfulProvisionTime = getLastSuccessfulProvisionTime(catalogItem);
  const helpLink = useHelpLink();
  const asset_uuid = catalogItem.metadata.labels?.['gpte.redhat.com/asset-uuid'];
  const { data: metrics } = useSWRImmutable<AssetMetrics>(
    asset_uuid ? apiPaths.ASSET_METRICS({ asset_uuid }) : null,
    fetcher,
    {
      shouldRetryOnError: false,
      suspense: false,
    }
  );
  const { data: catalogItemIncident } = useSWR<CatalogItemIncident>(
    asset_uuid ? apiPaths.CATALOG_ITEM_LAST_INCIDENT({ stage, asset_uuid }) : null,
    fetcher,
    {
      shouldRetryOnError: false,
      suspense: false,
    }
  );
  const catalogItemCpy = useMemo(() => {
    const cpy = Object.assign({}, catalogItem);
    cpy.metadata.annotations[`${BABYLON_DOMAIN}/incident`] = JSON.stringify(catalogItemIncident);
    return cpy;
  }, [catalogItem, catalogItemIncident]);
  const { data: userResourceClaims } = useSWR<ResourceClaim[]>(
    userNamespace?.name
      ? apiPaths.RESOURCE_CLAIMS({
          namespace: userNamespace.name,
          limit: 'ALL',
        })
      : null,
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.RESOURCE_CLAIMS({
          namespace: userNamespace.name,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        })
      ),
    {
      refreshInterval: 8000,
      compare: compareK8sObjectsArr,
    }
  );

  const services: ResourceClaim[] = useMemo(
    () =>
      Array.isArray(userResourceClaims)
        ? [].concat(...userResourceClaims.filter((r) => !isResourceClaimPartOfWorkshop(r)))
        : [],
    [userResourceClaims]
  );

  const descriptionHtml = useMemo(
    () => (
      <div
        className="catalog-item-details__description"
        dangerouslySetInnerHTML={{
          __html: description ? renderContent(description, { format: descriptionFormat }) : 'No description available.',
        }}
      />
    ),
    [description, descriptionFormat]
  );

  const status = getStatus(catalogItemCpy);
  const rating = getRating(catalogItem);
  const accessCheckResult = checkAccessControl(accessControl, groups, isAdmin);
  let autoStopTime = catalogItem.spec.runtime?.default;
  const autoDestroyTime = catalogItem.spec.lifespan?.default;
  if (autoStopTime && autoDestroyTime) {
    const autoStopTimeValue = parseDuration(autoStopTime);
    const autoDestroyTimeValue = parseDuration(autoDestroyTime);
    if (autoStopTimeValue === autoDestroyTimeValue || autoStopTimeValue > autoDestroyTimeValue) {
      autoStopTime = null;
    }
  }
  const catalogItemAccess: CatalogItemAccess =
    isAdmin || isLabDeveloper(groups)
      ? CatalogItemAccess.Allow
      : accessCheckResult === 'deny'
      ? CatalogItemAccess.Deny
      : services.length >= 5
      ? CatalogItemAccess.Deny
      : accessCheckResult === 'allow'
      ? CatalogItemAccess.Allow
      : CatalogItemAccess.RequestInformation;
  const catalogItemAccessDenyReason =
    catalogItemAccess !== CatalogItemAccess.Deny ? null : services.length >= 5 ? (
      <p>
        You have reached your quota of 5 services. You will not be able to request any new applications until you retire
        existing services. If you feel this is an error, please{' '}
        <a href={helpLink} target="_blank" rel="noopener noreferrer">
          contact us
        </a>
        .
      </p>
    ) : (
      <p>Access denied by catalog item configuration.</p>
    );

  const attributes: { [attr: string]: string } = {};
  for (const [label, value] of Object.entries(labels || {})) {
    if (label.startsWith(`${BABYLON_DOMAIN}/`)) {
      const attr = label.substring(BABYLON_DOMAIN.length + 1);
      if (!HIDDEN_LABELS_DETAIL_VIEW.includes(attr)) {
        attributes[attr] = value;
      }
    }
    if (label.startsWith(`${CATALOG_MANAGER_DOMAIN}/`)) {
      const attr = label.substring(CATALOG_MANAGER_DOMAIN.length + 1);
      if (!HIDDEN_LABELS_DETAIL_VIEW.includes(attr)) {
        attributes[attr] = value;
      }
    }
  }

  async function orderCatalogItem() {
    if (catalogItem.spec.externalUrl) {
      window.open(catalogItem.spec.externalUrl, '_blank');
    } else {
      navigate(`/catalog/${namespace}/order/${name}`);
    }
  }

  function requestInformation() {
    window.open(helpLink, '_blank');
  }

  return (
    <DrawerPanelContent
      className="catalog-item-details"
      widths={{ default: 'width_75', lg: 'width_75', xl: 'width_66', '2xl': 'width_50' }}
    >
      <DrawerHead>
        <DrawerActions>
          <DrawerCloseButton onClick={onClose} />
        </DrawerActions>
        <Split hasGutter>
          <SplitItem className="catalog-item-details__header-icon">
            <CatalogItemIcon catalogItem={catalogItem} />
          </SplitItem>
          <SplitItem isFilled className="catalog-item-details__header-text">
            <Title className="catalog-item-details__title" headingLevel="h1">
              {catalogItemName}
            </Title>
            {provider ? (
              <Title className="catalog-item-details__subtitle" headingLevel="h4">
                provided by {formatString(provider)}
              </Title>
            ) : null}
          </SplitItem>
        </Split>
        <PageSection variant={PageSectionVariants.light} className="catalog-item-details__actions">
          {catalogItemAccess === CatalogItemAccess.Allow ? (
            <>
              <Button
                key="order-catalog-item"
                onClick={orderCatalogItem}
                variant="primary"
                isDisabled={isAdmin ? false : status && status.disabled}
                className="catalog-item-details__main-btn"
              >
                Order{' '}
                {catalogItem.spec.externalUrl ? (
                  <ExternalLinkAltIcon style={{ width: '10px', paddingTop: '4px', marginLeft: '4px' }} />
                ) : null}
              </Button>
              {isAdmin ? (
                <Button
                  key="catalog-item-admin"
                  onClick={() => navigate(`/admin/catalogitems/${namespace}/${name}`)}
                  variant="secondary"
                >
                  Admin
                </Button>
              ) : null}
              <ShareLink
                url={
                  new URL(
                    `/catalog?item=${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`,
                    window.location.origin
                  )
                }
                name={catalogItemName}
              />
              {status && status.name !== 'Operational' ? (
                <div className="catalog-item-details__status">
                  <Label
                    className={`catalog-item-details__status--${status.name.replace(/\s+/g, '-').toLowerCase()}`}
                    variant="outline"
                    render={({ className, content }) =>
                      status && status.incidentUrl ? (
                        <a href={status.incidentUrl} target="_blank" rel="noreferrer" className={className}>
                          {content}
                        </a>
                      ) : (
                        <p className={className}>{content}</p>
                      )
                    }
                    icon={<StatusPageIcons style={{ width: '20px' }} status={status.name} />}
                  >
                    {status.name}
                  </Label>
                </div>
              ) : null}
            </>
          ) : catalogItemAccess === CatalogItemAccess.Deny ? (
            <>
              <Button key="button" isDisabled variant="primary" className="catalog-item-details__main-btn">
                Order{' '}
                {catalogItem.spec.externalUrl ? (
                  <ExternalLinkAltIcon style={{ width: '10px', paddingTop: '4px', marginLeft: '4px' }} />
                ) : null}
              </Button>
              <div key="reason" className="catalog-item-details__access-deny-reason">
                {catalogItemAccessDenyReason}
              </div>
            </>
          ) : catalogItemAccess === CatalogItemAccess.RequestInformation ? (
            <Button onClick={requestInformation} variant="primary" className="catalog-item-details__main-btn--expanded">
              Request Information
            </Button>
          ) : (
            <LoadingIcon className="catalog-item-details__actions--loading" />
          )}
        </PageSection>
      </DrawerHead>
      <DrawerContentBody className="catalog-item-details__body">
        <Sidebar>
          <SidebarPanel className="catalog-item-details__sidebar">
            <DescriptionList>
              {catalogItem.status?.provisionHistory ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Health</DescriptionListTerm>
                  <DescriptionListDescription>
                    <CatalogItemHealthDisplay provisionHistory={catalogItem.status.provisionHistory} />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
              {Object.entries(attributes)
                .sort(sortLabels)
                .map(([attr, value]) => (
                  <DescriptionListGroup key={attr}>
                    <DescriptionListTerm>
                      {attr === CUSTOM_LABELS.ESTIMATED_COST.key
                        ? null
                        : attr === CUSTOM_LABELS.SLA.key
                        ? 'Service Level'
                        : formatString(attr)}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {attr === CUSTOM_LABELS.RATING.key ? (
                        <StarRating count={5} rating={rating?.ratingScore} total={rating?.totalRatings} readOnly />
                      ) : attr === CUSTOM_LABELS.SLA.key ? (
                        value.includes('External') ? (
                          formatString(value)
                        ) : (
                          <Link to="/support">{formatString(value)}</Link>
                        )
                      ) : attr === CUSTOM_LABELS.ESTIMATED_COST.key ? null : (
                        formatString(value)
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ))}

              {metrics?.medianRuntimeCostByHour ? (
                <DescriptionListGroup className="catalog-item-details__estimated-cost">
                  <DescriptionListTerm>
                    Estimated Hourly Cost
                    <Tooltip content="Estimated hourly cost if not stopped.">
                      <InfoAltIcon
                        style={{
                          paddingTop: 'var(--pf-v5-global--spacer--xs)',
                          marginLeft: 'var(--pf-v5-global--spacer--xs)',
                          width: 'var(--pf-v5-global--icon--FontSize--sm)',
                        }}
                      />
                    </Tooltip>
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    {formatCurrency(metrics?.medianRuntimeCostByHour * 1.1)}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}

              {metrics?.medianProvisionHour ? (
                <DescriptionListGroup className="catalog-item-details__estimated-time">
                  <DescriptionListTerm>Estimated provision time</DescriptionListTerm>
                  <DescriptionListDescription>
                    {`±${formatTime(`${metrics?.medianProvisionHour * 60 * 1.1}m`)}`}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}

              <DescriptionListGroup className="catalog-item-details__uptime">
                <DescriptionListTerm>
                  Uptime
                  <Tooltip content="Uptime during the last 90 days.">
                    <InfoAltIcon
                      style={{
                        paddingTop: 'var(--pf-v5-global--spacer--xs)',
                        marginLeft: 'var(--pf-v5-global--spacer--xs)',
                        width: 'var(--pf-v5-global--icon--FontSize--sm)',
                      }}
                    />
                  </Tooltip>
                </DescriptionListTerm>
                <DescriptionListDescription>
                  <UptimeDisplay
                    uptime={catalogItemIncident ? calculateUptimePercentage(catalogItemIncident.downtime_hours) : 100}
                  />
                </DescriptionListDescription>
              </DescriptionListGroup>

              {lastUpdate && lastUpdate.git ? (
                <DescriptionListGroup className="catalog-item-details__last-update">
                  <DescriptionListTerm>Last update</DescriptionListTerm>
                  <DescriptionListDescription>
                    {isAdmin || isLabDeveloper(groups) ? (
                      <a
                        href={`https://github.com/rhpds/agnosticv/commit/${lastUpdate.git.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <TimeInterval toTimestamp={lastUpdate.git.when_committer} />
                      </a>
                    ) : (
                      <TimeInterval toTimestamp={lastUpdate.git.when_committer} />
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}

              {lastSuccessfulProvisionTime ? (
                <DescriptionListGroup className="catalog-item-details__last-provision">
                  <DescriptionListTerm>Last successful provision</DescriptionListTerm>
                  <DescriptionListDescription>
                    <TimeInterval toEpochMilliseconds={lastSuccessfulProvisionTime} />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}

              {autoStopTime ? (
                <DescriptionListGroup className="catalog-item-details__auto-stop">
                  <DescriptionListTerm>Auto-Stop</DescriptionListTerm>
                  <DescriptionListDescription>
                    <TimeInterval interval={autoStopTime}></TimeInterval>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}

              {autoDestroyTime ? (
                <DescriptionListGroup className="catalog-item-details__auto-destroy">
                  <DescriptionListTerm>Auto-Destroy</DescriptionListTerm>
                  <DescriptionListDescription>
                    <TimeInterval interval={autoDestroyTime}></TimeInterval>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
            </DescriptionList>
          </SidebarPanel>
          <SidebarContent>
            <p className="catalog-item-details__description-label">Description</p>
            {descriptionHtml}
          </SidebarContent>
        </Sidebar>
      </DrawerContentBody>
    </DrawerPanelContent>
  );
};

export default CatalogItemDetails;
