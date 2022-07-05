import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
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
} from '@patternfly/react-core';
import { apiPaths, createServiceRequest, fetcher } from '@app/api';
import {
  selectCatalogNamespace,
  selectUserGroups,
  selectUserIsAdmin,
  selectUserNamespace,
  selectWorkshopNamespaces,
} from '@app/store';
import { CatalogItem, CatalogNamespace, ResourceClaim, ResourceClaimList, ServiceNamespace } from '@app/types';
import { checkAccessControl, displayName, renderContent, BABYLON_DOMAIN, FETCH_BATCH_LIMIT } from '@app/util';
import LoadingIcon from '@app/components/LoadingIcon';
import CatalogItemIcon from './CatalogItemIcon';
import CatalogItemHealthDisplay from './CatalogItemHealthDisplay';
import CatalogItemRating from './CatalogItemRating';
import {
  getProvider,
  getDescription,
  formatTime,
  getIsDisabled,
  getStatus,
  HIDDEN_LABELS,
  getIncidentUrl,
} from './catalog-utils';
import StatusPageIcons from '@app/components/StatusPageIcons';
import useSWRInfinite from 'swr/infinite';

import './catalog-item-details.css';

enum CatalogItemAccess {
  Allow,
  Deny,
  RequestInformation,
}

const CatalogItemDetails: React.FC<{ catalogItem: CatalogItem; onClose: () => void }> = ({ catalogItem, onClose }) => {
  const history = useHistory();
  const location = useLocation();
  const urlSearchParams = new URLSearchParams(location.search);
  const { provisionTimeEstimate, termsOfService, parameters, accessControl } = catalogItem.spec;
  const { labels, namespace, name } = catalogItem.metadata;
  const provider = getProvider(catalogItem);
  const catalogItemName = displayName(catalogItem);
  const { description, descriptionFormat } = getDescription(catalogItem);
  const displayProvisionTime = provisionTimeEstimate && formatTime(provisionTimeEstimate);
  const catalogNamespace: CatalogNamespace = useSelector((state) => selectCatalogNamespace(state, namespace));
  const userGroups: string[] = useSelector(selectUserGroups);
  const userIsAdmin: boolean = useSelector(selectUserIsAdmin);
  const userNamespace: ServiceNamespace = useSelector(selectUserNamespace);
  const workshopNamespaces: ServiceNamespace[] = useSelector(selectWorkshopNamespaces);
  const {
    data: resourceClaimsPages,
    size,
    setSize,
  } = useSWRInfinite<ResourceClaimList>(
    (index, previousPageData: ResourceClaimList) => {
      if (!userNamespace.name) {
        return null;
      }
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.RESOURCE_CLAIMS({
        namespace: userNamespace.name,
        limit: FETCH_BATCH_LIMIT,
        continueId,
      });
    },
    fetcher,
    {
      fallbackData: [
        {
          items: [],
          metadata: {
            continue: '',
          },
        },
      ],
    }
  );

  const userResourceClaims: ResourceClaim[] = useMemo(
    () => [].concat(...resourceClaimsPages.map((page) => page.items)) || [],
    [resourceClaimsPages]
  );
  const userHasInstanceOfCatalogItem = userResourceClaims.some(
    (rc) =>
      namespace === rc.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemNamespace`] &&
      name === rc.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`]
  );
  // Fetch all pages
  if (resourceClaimsPages.length > 0 && resourceClaimsPages[resourceClaimsPages.length - 1].metadata.continue) {
    setSize(size + 1);
  }
  const isDisabled = getIsDisabled(catalogItem);
  const { code: statusCode, name: statusName } = getStatus(catalogItem);
  const incidentUrl = getIncidentUrl(catalogItem);

  const accessCheckResult: string = checkAccessControl(accessControl, userGroups);

  const catalogItemAccess: CatalogItemAccess = userIsAdmin
    ? CatalogItemAccess.Allow
    : accessCheckResult === 'deny'
    ? CatalogItemAccess.Deny
    : userHasInstanceOfCatalogItem
    ? CatalogItemAccess.Deny
    : userResourceClaims.length >= 3
    ? CatalogItemAccess.Deny
    : accessCheckResult === 'allow'
    ? CatalogItemAccess.Allow
    : CatalogItemAccess.RequestInformation;
  const catalogItemAccessDenyReason: string =
    catalogItemAccess !== CatalogItemAccess.Deny
      ? null
      : userHasInstanceOfCatalogItem
      ? 'You already have an instance of this catalog item. You will not be able to request another instance of this application until you retire the existing service. If you feel this is an error, please contact rhpds-help@redhat.com.'
      : userResourceClaims.length >= 3
      ? 'You have reached your quota of 3 services. You will not be able to request any new applications until you retire existing services. If you feel this is an error, please contact rhpds-help@redhat.com.'
      : 'Access denied by catalog item configuration.';

  const attributes: { [attr: string]: string } = {};
  for (const [label, value] of Object.entries(labels || {})) {
    if (label.startsWith(`${BABYLON_DOMAIN}/`)) {
      const attr: string = label.substring(BABYLON_DOMAIN.length + 1);
      if (!HIDDEN_LABELS.includes(attr)) {
        attributes[attr] = value;
      }
    }
  }

  async function requestCatalogItem(): Promise<void> {
    // Either direct user to request form or immediately request if form would be empty.
    if (termsOfService || (parameters || []).length > 0) {
      urlSearchParams.set('request', 'service');
      history.push(`${location.pathname}?${urlSearchParams.toString()}`);
    } else {
      const resourceClaim = await createServiceRequest({
        catalogItem: catalogItem,
        catalogNamespace: catalogNamespace,
      });
      history.push(`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`);
    }
  }

  function requestWorkshop(): void {
    urlSearchParams.set('request', 'workshop');
    history.push(`${location.pathname}?${urlSearchParams.toString()}`);
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
        <Split>
          <SplitItem className="catalog-item-details__header-icon">
            <CatalogItemIcon catalogItem={catalogItem} />
          </SplitItem>
          <SplitItem isFilled className="catalog-item-details__header-text">
            <Title className="catalog-item-details__title" headingLevel="h1">
              {catalogItemName}
            </Title>
            {provider ? (
              <Title className="catalog-item-details__subtitle" headingLevel="h4">
                provided by {provider.replace(/_/g, ' ')}
              </Title>
            ) : null}
          </SplitItem>
        </Split>
        <PageSection variant={PageSectionVariants.light} className="catalog-item-details__actions">
          {catalogItemAccess === CatalogItemAccess.Allow ? (
            <>
              <Button
                key="request-service"
                onClick={requestCatalogItem}
                variant="primary"
                isDisabled={userIsAdmin ? false : isDisabled}
              >
                Request Service
              </Button>
              {workshopNamespaces.length > 0 ? (
                <Button
                  key="request-workshop"
                  onClick={requestWorkshop}
                  variant="primary"
                  isDisabled={userIsAdmin ? false : isDisabled}
                >
                  Request Workshop
                </Button>
              ) : null}
              {userIsAdmin ? (
                <Button
                  key="catalog-item-admin"
                  onClick={() => history.push(`/admin/catalogitems/${namespace}/${name}`)}
                  variant="secondary"
                >
                  Admin
                </Button>
              ) : null}
              {statusCode && statusCode !== 'operational' ? (
                <div className="catalog-item-details__status">
                  <Label
                    className={`catalog-item-details__status--${statusCode}`}
                    variant="outline"
                    render={({ className, content }) =>
                      incidentUrl ? (
                        <a href={incidentUrl} target="_blank" rel="noreferrer" className={className}>
                          {content}
                        </a>
                      ) : (
                        <p className={className}>{content}</p>
                      )
                    }
                    icon={<StatusPageIcons style={{ width: '20px' }} status={statusCode} />}
                  >
                    {statusName}
                  </Label>
                </div>
              ) : null}
            </>
          ) : catalogItemAccess === CatalogItemAccess.Deny ? (
            <>
              <Button key="button" isDisabled variant="primary">
                Request Service
              </Button>
              <div key="reason" className="catalog-item-details__access-deny-reason">
                {catalogItemAccessDenyReason}
              </div>
            </>
          ) : catalogItemAccess === CatalogItemAccess.RequestInformation ? (
            <Button onClick={requestCatalogItem} variant="primary">
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
              {catalogItem.status?.rating ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Rating</DescriptionListTerm>
                  <DescriptionListDescription>
                    <CatalogItemRating catalogItem={catalogItem} starDimension="20px" />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
              {catalogItem.status?.provisionHistory ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Health</DescriptionListTerm>
                  <DescriptionListDescription>
                    <CatalogItemHealthDisplay catalogItem={catalogItem} />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
              {Object.entries(attributes).map(([attr, value]) => (
                <DescriptionListGroup key={attr}>
                  <DescriptionListTerm>{attr.replace(/_/g, ' ')}</DescriptionListTerm>
                  <DescriptionListDescription>{value.replace(/_/g, ' ')}</DescriptionListDescription>
                </DescriptionListGroup>
              ))}
              {provisionTimeEstimate ? (
                <DescriptionListGroup className="catalog-item-details__estimated-time">
                  <DescriptionListTerm>Estimated provision time</DescriptionListTerm>
                  <DescriptionListDescription>
                    {displayProvisionTime !== '-' ? `Up to ${displayProvisionTime}` : displayProvisionTime}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
            </DescriptionList>
          </SidebarPanel>
          <SidebarContent>
            <p className="catalog-item-details__description-label">Description</p>
            <div
              className="catalog-item-details__description"
              dangerouslySetInnerHTML={{
                __html: description
                  ? renderContent(description, { format: descriptionFormat })
                  : 'No description available.',
              }}
            />
          </SidebarContent>
        </Sidebar>
      </DrawerContentBody>
    </DrawerPanelContent>
  );
};

export default CatalogItemDetails;
