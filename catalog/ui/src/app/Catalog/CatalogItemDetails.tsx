import React from 'react';
import { useEffect, useState } from "react";
import { useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';

import {
  ActionGroup,
  Bullseye,
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
} from '@patternfly/react-core';

import { createServiceRequest } from '@app/api';
import {
  selectCatalogNamespace,
  selectResourceClaimsInNamespace,
  selectUserGroups,
  selectUserIsAdmin,
  selectUserNamespace,
  selectWorkshopNamespaces,
} from '@app/store';
import { CatalogItem, CatalogNamespace, ResourceClaim, ServiceNamespace } from '@app/types';
import { checkAccessControl, displayName, renderContent } from '@app/util';

import LoadingIcon from '@app/components/LoadingIcon';

import CatalogItemIcon from './CatalogItemIcon';
import CatalogItemHealthDisplay from './CatalogItemHealthDisplay';
import CatalogItemRating from './CatalogItemRating';

enum CatalogItemAccess {
  Allow,
  Deny,
  RequestInformation,
}

interface CatalogItemDetailsProps {
  catalogItem: CatalogItem;
  onClose: () => void;
}

const CatalogItemDetails: React.FunctionComponent<CatalogItemDetailsProps> = ({
  catalogItem,
  onClose,
}) => {
  const history = useHistory();
  const location = useLocation();
  const urlSearchParams = new URLSearchParams(location.search);

  const provider:string = catalogItem.metadata.labels?.['babylon.gpte.redhat.com/provider'] || 'Red Hat';
  const description = catalogItem.metadata.annotations?.['babylon.gpte.redhat.com/description'];
  const descriptionFormat = catalogItem.metadata.annotations?.['babylon.gpte.redhat.com/descriptionFormat'] || 'asciidoc';

  const catalogNamespace:CatalogNamespace = useSelector(
    (state) => selectCatalogNamespace(state, catalogItem.metadata.namespace)
  );
  const userGroups:string[] = useSelector(selectUserGroups);
  const userIsAdmin:boolean = useSelector(selectUserIsAdmin);
  const userNamespace:ServiceNamespace = useSelector(selectUserNamespace);
  const userResourceClaims:ResourceClaim[] = useSelector(
    (state) => selectResourceClaimsInNamespace(state, userNamespace?.name)
  );
  const workshopNamespaces:ServiceNamespace[] = useSelector(selectWorkshopNamespaces);
  const userHasInstanceOfCatalogItem:boolean = userResourceClaims.find((rc) =>
    catalogItem.metadata.namespace === rc.metadata.labels?.['babylon.gpte.redhat.com/catalogItemNamespace'] &&
    catalogItem.metadata.name === rc.metadata.labels?.['babylon.gpte.redhat.com/catalogItemName']
  ) ? true : false;

  const accessCheckResult:string = checkAccessControl(catalogItem.spec.accessControl, userGroups);

  const catalogItemAccess:CatalogItemAccess = (
    userIsAdmin ? CatalogItemAccess.Allow :
    accessCheckResult === 'deny' ? CatalogItemAccess.Deny :
    userHasInstanceOfCatalogItem ? CatalogItemAccess.Deny :
    userResourceClaims.length >= 3 ? CatalogItemAccess.Deny :
    accessCheckResult === 'allow' ? CatalogItemAccess.Allow :
    CatalogItemAccess.RequestInformation
  );
  const catalogItemAccessDenyReason:string = (
    catalogItemAccess !== CatalogItemAccess.Deny ? null :
    userHasInstanceOfCatalogItem ? (
      "You already have an instance of this catalog item. You will not be able to request another instance of this application until you retire the existing service. If you feel this is an error, please contact rhpds-help@redhat.com."
    ) :
    userResourceClaims.length >= 3 ? (
      "You have reached your quota of 3 services. You will not be able to request any new applications until you retire existing services. If you feel this is an error, please contact rhpds-help@redhat.com."
    ) :
    "Access denied by catalog item configuration."
  )

  const attributes:{[attr:string]: string} = {};
  for (const [label, value] of Object.entries(catalogItem.metadata.labels || {})) {
    if (label.startsWith('babylon.gpte.redhat.com/')
      && label !== 'babylon.gpte.redhat.com/stage'
    ) {
      const attr:string = label.substring(24);
      attributes[attr] = value;
    }
  }

  async function requestCatalogItem(): Promise<void> {
    // Either direct user to request form or immediately request if form would be empty.
    if (
      catalogItem.spec.termsOfService ||
      (catalogItem.spec.parameters || []).length > 0
    ) {
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

  async function requestWorkshop(): Promise<void> {
    urlSearchParams.set('request', 'workshop');
    history.push(`${location.pathname}?${urlSearchParams.toString()}`);
  }

  return (
    <DrawerPanelContent
      className="catalog-item-details"
      widths={{default: 'width_75', lg: 'width_75', xl: 'width_66', '2xl': 'width_50'}}
    >
      <DrawerHead className="catalog-item-header">
        <DrawerActions>
          <DrawerCloseButton onClick={onClose} />
        </DrawerActions>
        <Split>
          <SplitItem>
            <CatalogItemIcon catalogItem={catalogItem} />
          </SplitItem>
          <SplitItem isFilled>
            <Title className="catalog-item-title" headingLevel="h3">{displayName(catalogItem)}</Title>
            { provider ? (
              <Title className="catalog-item-subtitle" headingLevel="h4">provided by {provider}</Title>
            ) : null }
          </SplitItem>
        </Split>
        <PageSection variant={PageSectionVariants.light} className="catalog-item-actions">
          { catalogItemAccess === CatalogItemAccess.Allow ? (<>
            <Button key="request-service" onClick={requestCatalogItem} variant="primary">Request Service</Button>
            { workshopNamespaces.length > 0 ? (
              <Button key="request-workshop" onClick={requestWorkshop} variant="primary">Request Workshop</Button>
            ) : null }
          </>) : catalogItemAccess === CatalogItemAccess.Deny ? (
            <>
              <Button key="button" isDisabled variant="primary">Request Service</Button>
              <div key="reason" className="catalog-item-access-deny-reason">{ catalogItemAccessDenyReason }</div>
            </>
          ) : catalogItemAccess === CatalogItemAccess.RequestInformation ? (
            <Button onClick={requestCatalogItem} variant="primary">Request Information</Button>
          ) : (
            <LoadingIcon className="catalog-item-actions-loading-icon"/>
          ) }
        </PageSection>
      </DrawerHead>
      <DrawerContentBody className="catalog-item-body">
        <Sidebar>
          <SidebarPanel>
            <DescriptionList>
              { catalogItem.status?.rating ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Rating</DescriptionListTerm>
                  <DescriptionListDescription>
                    <CatalogItemRating catalogItem={catalogItem} starDimension="20px" />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null }
              { catalogItem.status?.provisionHistory ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Health</DescriptionListTerm>
                  <DescriptionListDescription>
                    <CatalogItemHealthDisplay catalogItem={catalogItem} />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null }
              { Object.entries(attributes).map(([attr, value]) =>
                <DescriptionListGroup key={attr}>
                  <DescriptionListTerm>{attr.replace(/_/g, ' ')}</DescriptionListTerm>
                  <DescriptionListDescription>{value.replace(/_/g, ' ')}</DescriptionListDescription>
                </DescriptionListGroup>
              )}
            </DescriptionList>
          </SidebarPanel>
          <SidebarContent>
            <Title headingLevel="h4">Description</Title>
            <div
              className="catalog-item-details-description"
              dangerouslySetInnerHTML={{
                __html: description ?
                  renderContent(description, {format: descriptionFormat}) :
                  "No description available."
              }}
            />
          </SidebarContent>
        </Sidebar>
      </DrawerContentBody>
    </DrawerPanelContent>
  )
}

export default CatalogItemDetails;
