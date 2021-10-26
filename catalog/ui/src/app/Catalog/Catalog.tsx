import * as React from 'react';

import {
  useSelector,
} from 'react-redux';

import {
  selectCatalogItems,
  selectResourceClaims,
  selectUserNamespace,
  selectCatalogNamespaces,
  selectUserGroups,
  selectInterface,
  selectUserIsAdmin,
} from '@app/store';

import './catalog.css';

import {
  useHistory,
  useRouteMatch,
  Link
} from 'react-router-dom';

import {
  Backdrop,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelBody,
  DrawerPanelContent,
  Dropdown,
  DropdownItem,
  DropdownToggle,
  EmptyState,
  EmptyStateIcon,
  Form,
  FormGroup,
  PageSection,
  PageSectionVariants,
  SearchInput,
  Sidebar,
  SidebarContent,
  SidebarPanel,
  Tab,
  Tabs,
  TabTitleText,
  Title,
} from '@patternfly/react-core';

import {
  ExternalLinkAltIcon
} from '@patternfly/react-icons';


import {
  createServiceRequest,
} from '@app/api';

import {
  checkAccessControl,
  displayName,
  renderContent,
} from '@app/util';

import { CatalogItemIcon } from './CatalogItemIcon';
import { CatalogItemHealthDisplay } from './CatalogItemHealthDisplay';
import { CatalogItemRating } from './CatalogItemRating';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';

import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';

export interface CatalogProps {
  location?: any;
}

const getCatalogItemsFromServices = (allResourceClaims: any, currentUserNamespace: any) => {
  const catalogItems = [];
  const resourceClaimList = allResourceClaims?.[currentUserNamespace.name] || {};
  for (const resourceClaim of resourceClaimList){
      const catalogItemName = resourceClaim.metadata.labels['babylon.gpte.redhat.com/catalogItemName'];
      const catalogItemNamespace = resourceClaim.metadata.labels['babylon.gpte.redhat.com/catalogItemNamespace'];
      catalogItems.push({catalogItemName, catalogItemNamespace});
    }
  return catalogItems;
};

const isRequestAllowed = (runningServices: any[], selectedCatalogItemName: string, selectedCatalogItemNamespace: string) => 
  Boolean(runningServices.find(catalogItemList => 
    catalogItemList.catalogItemName === selectedCatalogItemName &&
    catalogItemList.catalogItemNamespace === selectedCatalogItemNamespace
  ));

const HideLabels = ['babylon.gpte.redhat.com/userCatalogItem'];

const Catalog: React.FunctionComponent<CatalogProps> = ({
  location,
}) => {
  const history = useHistory();

  const catalogNamespaceRouteMatch = useRouteMatch<any>('/catalog/ns/:namespace');
  const catalogNamespaceItemRouteMatch = useRouteMatch<any>('/catalog/ns/:namespace/item/:name');
  const catalogItemRouteMatch = useRouteMatch<any>('/catalog/item/:namespace/:name');

  const catalogItemNamespaceName = catalogNamespaceItemRouteMatch?.params.namespace || catalogItemRouteMatch?.params.namespace;
  const catalogItemName = catalogNamespaceItemRouteMatch?.params.name || catalogItemRouteMatch?.params.name;
  const catalogNamespaceName = catalogNamespaceItemRouteMatch?.params.namespace || catalogNamespaceRouteMatch?.params.namespace;
  const catalogPath = catalogNamespaceName ? `/catalog/ns/${catalogNamespaceName}` : '/catalog';

  const userGroups = useSelector(selectUserGroups);
  const userInterface = useSelector(selectInterface);
  const userIsAdmin = useSelector(selectUserIsAdmin);
  const allResourceClaims = useSelector(selectResourceClaims);
  const currentUserNamespace = useSelector(selectUserNamespace);
  const catalogItems = useSelector(selectCatalogItems);
  const catalogNamespaces = useSelector(selectCatalogNamespaces);
  const catalogNamespace = catalogNamespaceName ? (catalogNamespaces.find(ns => ns.name == catalogNamespaceName) || {name: catalogNamespaceName, displayName: catalogNamespaceName, description: ""}) : null;
  const catalogItemNamespace = catalogItemNamespaceName ? (catalogNamespaces.find(ns => ns.name == catalogItemNamespaceName) || {name: catalogItemNamespaceName, displayName: catalogItemNamespaceName, description: ""}) : null;

  const [activeCategory, setActiveCategory] = React.useState('all');
  const [catalogNamespaceSelectIsOpen, setCatalogNamespaceSelectIsOpen] = React.useState(false);
  const [keywordSearchValue, setKeywordSearchValue] = React.useState('');
  const [selectedAttributeFilters, setSelectedAttributeFilters] = React.useState({});

  const generalServiceCountError = "You are running 3 applications and have exceeded your quota of (3) applications. You will not be able to request any new applications until you retire existing applications. If you feel this is an error, please contact rhpds-help@redhat.com.";
  const alreadyRunningInstanceError = "You are already running 1 instance(s) of the requested application. You will not be able to request another instance of this application until you retire the existing application. If you feel this is an error, please contact rhpds-help@redhat.com.";
  
  const selectedCatalogItem = catalogItemName ? (
    catalogItems?.[catalogItemNamespaceName] || []
  ).find(ci => ci.metadata.name == catalogItemName) : null;
  const selectedCatalogItemProvider = selectedCatalogItem?.metadata?.labels?.['babylon.gpte.redhat.com/provider']

  const selectedCatalogItemName = selectedCatalogItem?.metadata?.name;
  const selectedCatalogItemNamespace = selectedCatalogItem?.metadata?.namespace;
  const catalogItemList = getCatalogItemsFromServices(allResourceClaims, currentUserNamespace);

  function category(catalogItem: { metadata: { labels: { [x: string]: string | null; }; }; }): string | null {
    if (catalogItem.metadata.labels) {
      return catalogItem.metadata.labels['babylon.gpte.redhat.com/category'];
    } else {
      return null;
    }
  }

  function description(catalogItem, options={}): string {
    if (catalogItem.metadata?.annotations?.['babylon.gpte.redhat.com/description']) {
      options['format'] = catalogItem.metadata.annotations?.['babylon.gpte.redhat.com/descriptionFormat'] || 'asciidoc';
      return renderContent(catalogItem.metadata.annotations['babylon.gpte.redhat.com/description'], options);
    } else {
      return 'No description provided.';
    }
  }

  function icon(ci): string {
    if (ci.metadata.annotations && ci.metadata.annotations['babylon.gpte.redhat.com/icon']) {
      return ci.metadata.annotations['babylon.gpte.redhat.com/icon'];
    } else {
      return '';
    }
  }

  async function requestCatalogItem(): Promise<void> {
    // Either direct user to request form or immediately request if form would be empty.
    if (
      selectedCatalogItem.spec.termsOfService ||
      (selectedCatalogItem.spec.parameters || []).length > 0
    ) {
      history.push({
        pathname: `/catalog/request/${catalogItemNamespaceName}/${catalogItemName}`,
        state: { fromCatalog: true },
      });
    } else {
      const resourceClaim = await createServiceRequest({
        catalogItem: selectedCatalogItem,
        catalogNamespace: catalogItemNamespace,
      });
      history.push(`/services/ns/${resourceClaim.metadata.namespace}/item/${resourceClaim.metadata.name}`);
    }
  }

  function unselectCatalogItem(): void {
    if (location.state) {
      history.goBack();
    } else {
      history.push(catalogPath);
    }
  }

  function onKeywordSearchChange(value): void {
    setKeywordSearchValue(value);
  }

  function onAttributeFilterChange(checked: boolean, event): void {
    const [attrKey, valueKey] = event.target.id.split('/');
    setSelectedAttributeFilters(value => {
      const ret = JSON.parse(JSON.stringify(value));
      if (ret[attrKey]) {
        if (ret[attrKey][valueKey]) {
          delete ret[attrKey][valueKey];
        } else {
          ret[attrKey][valueKey] = true;
        }
      } else {
        ret[attrKey] = {[valueKey]: true};
      }
      return ret;
    });
  }

  const descriptionDiv = selectedCatalogItem ? (
    <div
      className="rhpds-catalog-item-details-description"
      dangerouslySetInnerHTML={{
        __html: description(selectedCatalogItem, {allowIFrame: true})
      }}
    />
  ) : null;
  const selectedCatalogItemAccess = checkAccessControl(selectedCatalogItem?.spec?.accessControl, userGroups);
  const selectedCatalogItemDisplay = selectedCatalogItem ? (
    <DrawerPanelContent
      className="rhpds-catalog-item-details"
      widths={{default: 'width_75', lg: 'width_75', xl: 'width_66', '2xl': 'width_50'}}
    >
      <DrawerHead>
        <div className="rhpds-catalog-item-header">
          <CatalogItemIcon icon={icon(selectedCatalogItem)} />
          <div className="rhpds-catalog-item-header-text">
            <div className="rhpds-catalog-item-title">{displayName(selectedCatalogItem)}</div>
            { selectedCatalogItemProvider ? (
              <div className="rhpds-catalog-item-subtitle">provided by {selectedCatalogItemProvider}</div>
            ) : null }
          </div>
        </div>
        <DrawerActions>
          <DrawerCloseButton onClick={unselectCatalogItem} />
        </DrawerActions>
      </DrawerHead>
        <PageSection variant={PageSectionVariants.light} className="rhpds-catalog-item-details-actions">
        {userIsAdmin ?
          <Button
            onClick={requestCatalogItem}
            isDisabled={'deny' === selectedCatalogItemAccess}
            variant={selectedCatalogItemAccess === 'allow' ? 'primary' : 'secondary'}
          >
            {selectedCatalogItemAccess === 'allow' ? 'Request Service' : 'Request Information'}
          </Button> :
          <Button
            onClick={requestCatalogItem}
            isDisabled={selectedCatalogItemAccess === 'true' ? true : isRequestAllowed(catalogItemList, selectedCatalogItemName, selectedCatalogItemNamespace) || catalogItemList.length >= 3}
            variant={selectedCatalogItemAccess === 'allow' ? 'primary' : 'secondary'}
          >
            {selectedCatalogItemAccess === 'allow' ? 'Request Service' : 'Request Information'}
          </Button>
        }
        {(() => {
          if (!userIsAdmin) {
            if (isRequestAllowed(catalogItemList, selectedCatalogItemName, selectedCatalogItemNamespace) && catalogItemList.length < 3) {
              return (<p style={{ color: 'red' }}> {alreadyRunningInstanceError} </p>)
            } else if (catalogItemList.length >= 3) {
              return (<p style={{ color: 'red' }}> {generalServiceCountError} </p>)
            }
          }
          return null;
        })()}
        </PageSection>
      <PageSection variant={PageSectionVariants.light} className="rhpds-catalog-item-details-body">
        <div className="rhpds-catalog-item-details-body-sidebar">
          <DescriptionList>
            { selectedCatalogItem.status?.rating ? (
              <DescriptionListGroup>
                <DescriptionListTerm>Rating</DescriptionListTerm>
                <DescriptionListDescription>
                  <CatalogItemRating catalogItem={selectedCatalogItem} starDimension="20px" />
                </DescriptionListDescription>
              </DescriptionListGroup>
            ) : null }

            { selectedCatalogItem.status?.provisionHistory ? (
              <DescriptionListGroup>
                <DescriptionListTerm>Health</DescriptionListTerm>
                <DescriptionListDescription>
                  <CatalogItemHealthDisplay catalogItem={selectedCatalogItem} />
                </DescriptionListDescription>
              </DescriptionListGroup>
            ) : null }

            { Object.keys(selectedCatalogItem.metadata.labels)
              .filter(label => {
                if (!label.startsWith('babylon.gpte.redhat.com/')
                  || HideLabels.includes(label)
                ) {
                  return false;
                }
                const attr = label.substring(24);
                return !['category'].includes(attr);
              })
              .map(label => {
                const attr = label.substring(24);
                if (attr === 'stage') {
                    return null
                }
                const value = selectedCatalogItem.metadata.labels[label];
                return (
                  <DescriptionListGroup key={attr}>
                    <DescriptionListTerm>{attr.replace(/_/g, ' ')}</DescriptionListTerm>
                    <DescriptionListDescription>{value.replace(/_/g, ' ')}</DescriptionListDescription>
                  </DescriptionListGroup>
                );
              })
            }
          </DescriptionList>
        </div>
        <div className="rhpds-catalog-item-details-body-content">
          <div className="rhpds-heading">Description</div>
          { descriptionDiv }
        </div>
      </PageSection>
    </DrawerPanelContent>
  ) : null;

  const allCatalogItems = (
    catalogNamespaceName ? (
      catalogItems?.[catalogNamespaceName] || []
    ) : (
      Object.values(catalogItems || []).reduce((a : any, v) => a.concat(v), [])
    )
  );

  const availableCatalogItems = allCatalogItems.filter(ci => {
    if ('deny' === checkAccessControl(ci.spec.accessControl, userGroups)) {
      return false;
    }
    if (activeCategory !== 'all' && activeCategory !== category(ci)) {
      return false;
    }
    return true;
  });

  const filteredCatalogItems = availableCatalogItems.filter(ci => {
    const ciCategory = category(ci);
    const ciDescription = ci.metadata.annotations?.['babylon.gpte.redhat.com/description'];
    if (keywordSearchValue) {
      const keywords = keywordSearchValue.trim().split(/ +/);
      for (let i=0; i < keywords.length; ++i) {
        const keyword = keywords[i].toLowerCase();
        let keywordMatch = null;
        if (ci.metadata.name.toLowerCase().includes(keyword)
          || displayName(ci).toLowerCase().includes(keyword)
          || (ciCategory && ciCategory.toLowerCase().includes(keyword))
          || (ciDescription && ciDescription.toLowerCase().includes(keyword))
        ) {
          keywordMatch = true;
        }
        if (!keywordMatch && ci.metadata.labels) {
          for (const label in ci.metadata.labels) {
            if (label.startsWith('babylon.gpte.redhat.com/')
              && ci.metadata.labels[label].toLowerCase().includes(keyword)
            ) {
              keywordMatch = true;
              break;
            }
          }
        }

        if (!keywordMatch) {
          return false;
        }
      }
    }

    for (const [attrKey, valueFilters] of Object.entries(selectedAttributeFilters)) {
      // Default to null, not matched or not matched, means no values were selected for this attribute.
      let attrMatch = null;
      for (const [valueKey, selected] of Object.entries(valueFilters as any)) {
        if (selected) {
          // If any filter is selected then a match is required.
          if (attrMatch === null) {
            attrMatch = false;
          }
          // If any label matches a selected value then the attribute filter matches
          if (ci.metadata.labels) {
            for (const [label, value] of Object.entries(ci.metadata.labels)) {
              if (label.startsWith('babylon.gpte.redhat.com/')) {
                const attr = label.substring(24).replace(/-[0-9]+$/, '');
                if (attrKey == attr.toLowerCase() && valueKey == (value as string).toLowerCase()) {
                  attrMatch = true;
                  break;
                }
              }
            }
          }
          if (attrMatch) {
            break;
          }
        }
      }
      if (attrMatch === false) {
        return false;
      }
    }

    return true;
  })
  .sort((a, b) => {
    const av = displayName(a);
    const bv = displayName(b);
    return av < bv ? -1 : av > bv ? 1 : 0;
  });

  const categories = Array.from(new Set(
    availableCatalogItems
    .map(ci => category(ci))
    .filter(category => category)
  ));
  categories.sort((a, b) => {
    const av = (a as string).toUpperCase();
    const bv = (b as string).toUpperCase();
    if (av == 'OTHER') {
      return 1;
    } else if( bv == 'OTHER') {
      return -1;
    } else {
      return av < bv ? -1 : av > bv ? 1 : 0;
    }
  });

  function extractAttributeFilters (catalogItems) {
    const attributeFilters: any = {};
    for (let i=0; i < catalogItems.length; ++i) {
      const ci = availableCatalogItems[i];
      if (!ci.metadata.labels) { continue; }
      for (const label in ci.metadata.labels) {
        if (!label.startsWith('babylon.gpte.redhat.com/')
          || label.toLowerCase() === 'babylon.gpte.redhat.com/category'
          || HideLabels.includes(label)
        ) {
          continue;
        }
        const attr = label.substring(24).replace(/-[0-9]+$/, '');
        const attrKey = attr.toLowerCase();
        const value = ci.metadata.labels[label];
        const valueKey = value.toLowerCase();
        if (!attributeFilters[attrKey]) {
          attributeFilters[attrKey] = {
            text: attr.replace(/_/g, ' '),
            values: {},
          }
        }
        const labelValues = attributeFilters[attrKey].values;
        if (labelValues[valueKey]) {
          labelValues[valueKey].count++;
        } else {
          labelValues[valueKey] = {
            count: 1,
            selected: selectedAttributeFilters[attrKey]?.[valueKey],
            text: value.replace(/_/g, ' '),
          }
        }
      }
    }

    // Hide stage if user only sees prod (single value)
    if (attributeFilters.stage && Object.keys(attributeFilters.stage.values).length == 1) {
      delete attributeFilters['stage'];
    }

    return attributeFilters;
  }

  const attributeFilters = extractAttributeFilters(availableCatalogItems);

  const catalogItemCards = filteredCatalogItems.map(
    catalogItem => {
      const provider = catalogItem?.metadata?.labels?.['babylon.gpte.redhat.com/provider']
      return (
        <Link
          className="rhpds-catalog-item-card-link"
          key={catalogItem.metadata.uid}
          to={{
            pathname: catalogNamespaceName ? `${catalogPath}/item/${catalogItem.metadata.name}` :  `${catalogPath}/item/${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`,
            state: { fromCatalog: true },
          }}
        >
          <CardHeader className="rhpds-catalog-item-card-header">
            <CatalogItemIcon icon={icon(catalogItem)} />
            <div>
              <div>
                {catalogItem.metadata.labels?.['babylon.gpte.redhat.com/stage'] === 'dev' ? (
                  <Badge className="rhpds-dev-badge">development</Badge>
                ) : null }
                {catalogItem.metadata.labels?.['babylon.gpte.redhat.com/stage'] === 'test' ? (
                  <Badge  className="rhpds-test-badge">test</Badge>
                ) : null }
              </div>
              <div>
            { (catalogItem.status && catalogItem.status.rating) ? (
              <CatalogItemRating catalogItem={catalogItem} starDimension="14px" />
            ) : null }
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="rhpds-catalog-item-title">{displayName(catalogItem)}</div>
            { provider ? (
              <div className="rhpds-catalog-item-subtitle">provided by {provider}</div>
            ) : null }
            <div
              className="rhpds-catalog-item-description"
              dangerouslySetInnerHTML={{__html: description(catalogItem)}}
            />
          </CardBody>
        </Link>
      );
    }
  );

  const selectActiveCategory = (event, category) => {
    setActiveCategory(category);
  };

  const renderCategoryTab = (category: string) => (
    <Tab key={category} eventKey={category} title={<TabTitleText>{category.replace(/_/g, ' ')}</TabTitleText>} aria-controls=""></Tab>
  );

  return (
    <Drawer isExpanded={selectedCatalogItem}>
      <DrawerContent panelContent={selectedCatalogItemDisplay}>
        {selectedCatalogItem ? (<Backdrop />) : null}
        <DrawerContentBody>
          { (catalogNamespace || catalogNamespaces.length > 1) ? (
            <PageSection variant={PageSectionVariants.light} className="rhpds-catalog-project-select">
              <Dropdown isPlain
                isOpen={catalogNamespaceSelectIsOpen}
                toggle={
                  <DropdownToggle onToggle={() => setCatalogNamespaceSelectIsOpen(v => !v)}>
                    Catalog: {catalogNamespace ? catalogNamespace.displayName : "all catalogs"}
                  </DropdownToggle>
                }
                dropdownItems={[
                    <DropdownItem key="*"
                      onClick={() => { setCatalogNamespaceSelectIsOpen(false); history.push("/catalog"); }}
                    >- all catalogs -</DropdownItem>
                  ].concat(catalogNamespaces.map(namespace =>
                    <DropdownItem key={namespace.name}
                      onClick={() => { setCatalogNamespaceSelectIsOpen(false); history.push(`/catalog/ns/${namespace.name}`) }}
                    >{namespace.displayName}</DropdownItem>
                  ))
                }
              />
            </PageSection>
          ) : null }
          { userInterface === 'rhpds' ? (
            <PageSection variant={PageSectionVariants.light} className="rhpds-catalog-header">
              <Title headingLevel="h1" size="2xl">Red Hat Product Demo System</Title>
              <div>Select an item to request a new service, demo, or lab.</div>
            </PageSection>
          ) : userInterface === 'summit' ? (
            <PageSection variant={PageSectionVariants.light} className="rhpds-catalog-header">
              <Title headingLevel="h1" size="2xl">Red Hat Summit Labs</Title>
              <div>Please select the catalog item for your lab as instructed by a lab facilitator.</div>
            </PageSection>
          ) : (
            <PageSection variant={PageSectionVariants.light} className="rhpds-catalog-header">
              <Title headingLevel="h1" size="2xl">Catalog</Title>
              <div>Select an item to request a new service, demo, or lab.</div>
            </PageSection>
          ) }
          <PageSection variant={PageSectionVariants.light}>
            <Card className="rhpds-catalog-box">
              <CardBody>
                <Sidebar>
                  <SidebarPanel>
                    <Tabs isVertical
                      activeKey={activeCategory}
                      onSelect={selectActiveCategory}
                      inset={{default: 'insetNone', sm: 'insetNone', md: 'insetNone', lg: 'insetNone', xl: 'insetNone', '2xl': 'insetNone'}}>
                      <Tab eventKey="all" title={<TabTitleText>All Items</TabTitleText>} aria-controls=""></Tab>
                      { categories.map(cat => renderCategoryTab(cat as string)) }
                    </Tabs>
                    <Form>
                    { Object.entries(attributeFilters).sort().map( ([attrKey, attr]: [any, any]) => (
                      <FormGroup key={attrKey} fieldId={attrKey}>
                        <fieldset>
                        <legend className="pf-c-form__label"><span className="pf-c-form__label-text">{attr.text}</span></legend>
                      { Object.entries(attr.values).sort().map( ([valueKey, value]: [any, any]) => (
                        <Checkbox id={attrKey + '/' + valueKey} key={attrKey + '/' + valueKey}
                          label={value.text + ' (' + value.count + ')'}
                          isChecked={value.selected}
                          onChange={onAttributeFilterChange}
                        />
                      ))}
                      </fieldset>
                      </FormGroup>
                    ))}
                    <Button
                      type="submit"
                      className="visually-hidden"
                      isDisabled
                    >
                      submit
                    </Button>
                    </Form>
                  </SidebarPanel>
                  <SidebarContent>
                    <PageSection variant={PageSectionVariants.light} className="rhpds-catalog-box-header">
                      <div className="rhpds-catalog-title">{activeCategory == 'all' ? 'All Items' : activeCategory.replace(/_/g, ' ')}</div>
                      <div className="rhpds-catalog-filter">
                        <SearchInput className="rhpds-catalog-keyword-search"
                          value=""
                          aria-label="Search"
                          placeholder="Filter by keyword..."
                          onChange={onKeywordSearchChange}
                        />
                        <div className="rhpds-catalog-filter__item-count">{filteredCatalogItems.length == 1 ? '1 item' : filteredCatalogItems.length + ' items'}</div>
                      </div>
                    </PageSection>
                    { catalogItemCards.length > 0 ? (
                      <PageSection variant={PageSectionVariants.default} className="rhpds-catalog-box-items">
                        { catalogItemCards }
                      </PageSection>
                    ) : (
                      <PageSection variant={PageSectionVariants.default} className="rhpds-catalog-box-empty">
                        <EmptyState>
                          { catalogItems ? "No catalog items match filters." : (
                            <EmptyStateIcon icon={LoadingIcon} />
                          ) }
                        </EmptyState>
                      </PageSection>
                    )}
                  </SidebarContent>
                </Sidebar>
              </CardBody>
            </Card>
          </PageSection>
        </DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
}

export default Catalog;
