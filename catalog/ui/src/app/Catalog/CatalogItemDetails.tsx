import React from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
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
import useSWR from 'swr';
import { apiPaths, createServiceRequest, fetcherItemsInAllPages } from '@app/api';
import { selectCatalogNamespace } from '@app/store';
import { CatalogItem, ResourceClaim } from '@app/types';
import LoadingIcon from '@app/components/LoadingIcon';
import StatusPageIcons from '@app/components/StatusPageIcons';
import useSession from '@app/utils/useSession';
import useImpersonateUser from '@app/utils/useImpersonateUser';
import {
  checkAccessControl,
  displayName,
  renderContent,
  BABYLON_DOMAIN,
  FETCH_BATCH_LIMIT,
  isLabDeveloper,
} from '@app/util';
import {
  getProvider,
  getDescription,
  formatTime,
  getIsDisabled,
  getStatus,
  HIDDEN_LABELS,
  getIncidentUrl,
  formatString,
} from './catalog-utils';
import CatalogItemIcon from './CatalogItemIcon';
import CatalogItemHealthDisplay from './CatalogItemHealthDisplay';
import CatalogItemRating from './CatalogItemRating';

import './catalog-item-details.css';

enum CatalogItemAccess {
  Allow,
  Deny,
  RequestInformation,
}

const CatalogItemDetails: React.FC<{ catalogItem: CatalogItem; onClose: () => void }> = ({ catalogItem, onClose }) => {
  const navigate = useNavigate();
  const { email, userNamespace, isAdmin, groups } = useSession().getSession();
  const catalogNamespace = useSelector((state) => selectCatalogNamespace(state, namespace));
  const { userImpersonated } = useImpersonateUser();
  const { provisionTimeEstimate, termsOfService, parameters, accessControl } = catalogItem.spec;
  const { labels, namespace, name } = catalogItem.metadata;
  const provider = getProvider(catalogItem);
  const catalogItemName = displayName(catalogItem);
  const { description, descriptionFormat } = getDescription(catalogItem);
  const displayProvisionTime = provisionTimeEstimate && formatTime(provisionTimeEstimate);
  const { data: userResourceClaims } = useSWR<ResourceClaim[]>(
    userNamespace.name
      ? apiPaths.RESOURCE_CLAIMS({
          namespace: userNamespace.name,
          limit: FETCH_BATCH_LIMIT,
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
    }
  );

  const services = userResourceClaims.filter(
    (rc) => !rc.metadata.labels?.['babylon.gpte.redhat.com/workshop-provision']
  );

  const isDisabled = getIsDisabled(catalogItem);
  const { code: statusCode, name: statusName } = getStatus(catalogItem);
  const incidentUrl = getIncidentUrl(catalogItem);
  const accessCheckResult = checkAccessControl(accessControl, groups);
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
        <a href={getHelpLink()} target="_blank" rel="noopener noreferrer">
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
      const attr: string = label.substring(BABYLON_DOMAIN.length + 1);
      if (!HIDDEN_LABELS.includes(attr)) {
        attributes[attr] = value;
      }
    }
  }

  async function orderCatalogItem(): Promise<void> {
    // Either direct user to request form or immediately request if form would be empty.
    if (termsOfService || (parameters || []).length > 0) {
      navigate(`/catalog/${namespace}/order/${name}`);
    } else {
      const resourceClaim = await createServiceRequest({
        catalogItem: catalogItem,
        catalogNamespaceName: catalogNamespace?.displayName || catalogItem.metadata.namespace,
        groups,
        userNamespace,
        usePoolIfAvailable: true,
      });
      navigate(`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`);
    }
  }

  function getHelpLink() {
    const user = userImpersonated ? userImpersonated : email;
    if (user.includes('@redhat.com')) {
      return 'https://red.ht/rhpds-help';
    }
    return 'https://red.ht/open-support';
  }

  function requestInformation() {
    window.open(getHelpLink(), '_blank');
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
                isDisabled={isAdmin ? false : isDisabled}
                className="catalog-item-details__main-btn"
              >
                Order
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
              <Button key="button" isDisabled variant="primary" className="catalog-item-details__main-btn">
                Order
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
              {catalogItem.status?.rating ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Rating</DescriptionListTerm>
                  <DescriptionListDescription>
                    <CatalogItemRating rating={catalogItem.status.rating} starDimension="20px" />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
              {catalogItem.status?.provisionHistory ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Health</DescriptionListTerm>
                  <DescriptionListDescription>
                    <CatalogItemHealthDisplay provisionHistory={catalogItem.status.provisionHistory} />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
              {Object.entries(attributes).map(([attr, value]) => (
                <DescriptionListGroup key={attr}>
                  <DescriptionListTerm>{formatString(attr)}</DescriptionListTerm>
                  <DescriptionListDescription>{formatString(value)}</DescriptionListDescription>
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
