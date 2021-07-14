import * as React from 'react';

import {
  useSelector,
} from 'react-redux';

import {
  selectCatalogItems,
  selectCatalogNamespaces,
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
  getApiSession,
  listNamespacedCustomObject
} from '@app/api';

import {
  displayName,
  renderAsciiDoc,
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

const Catalog: React.FunctionComponent<CatalogProps> = ({
  location,
}) => {
  const history = useHistory();

  const catalogNamespaceRouteMatch = useRouteMatch<IHostsMatchParams>('/catalog/ns/:namespace');
  const catalogNamespaceItemRouteMatch = useRouteMatch<IHostsMatchParams>('/catalog/ns/:namespace/item/:name');
  const catalogItemRouteMatch = useRouteMatch<IHostsMatchParams>('/catalog/item/:namespace/:name');

  const catalogItemNamespace = catalogNamespaceItemRouteMatch?.params.namespace || catalogItemRouteMatch?.params.namespace;
  const catalogItemName = catalogNamespaceItemRouteMatch?.params.name || catalogItemRouteMatch?.params.name;
  const catalogNamespaceName = catalogNamespaceItemRouteMatch?.params.namespace || catalogNamespaceRouteMatch?.params.namespace;
  const catalogPath = catalogNamespaceName ? `/catalog/ns/${catalogNamespaceName}` : '/catalog';

  const catalogItems = useSelector(selectCatalogItems);
  const catalogNamespaces = useSelector(selectCatalogNamespaces);
  const catalogNamespace = catalogNamespaceName ? (catalogNamespaces.find(ns => ns.name == catalogNamespaceName) || {name: catalogNamespaceName, displayName: catalogNamespaceName, description: ""}) : null;

  const [activeCategory, setActiveCategory] = React.useState('all');
  const [catalogNamespaceSelectIsOpen, setCatalogNamespaceSelectIsOpen] = React.useState(false);
  const [keywordSearchValue, setKeywordSearchValue] = React.useState('');
  const [selectedAttributeFilters, setSelectedAttributeFilters] = React.useState({});

  const selectedCatalogItem = catalogItemName ? (
    catalogItems?.[catalogItemNamespace] || []
  ).find(ci => ci.metadata.name == catalogItemName) : null;

  function badge(catalogItem): string {
    if (catalogItem.metadata.labels) {
      return catalogItem.metadata.labels['babylon.gpte.redhat.com/product'];
    } else {
      return 'environment';
    }
  }

  function category(catalogItem): string {
    if (catalogItem.metadata.labels) {
      return catalogItem.metadata.labels['babylon.gpte.redhat.com/category'];
    } else {
      return null;
    }
  }

  function creationTimestamp(catalogItem): string {
     const ts = catalogItem.status && catalogItem.status.creationTimestamp ? catalogItem.status.creationTimestamp : catalogItem.metadata.creationTimestamp;
     return (<LocalTimestamp timestamp={ts}/>);
  }

  function updateTimestamp(catalogItem): string {
     const ts = catalogItem.status && catalogItem.status.updateTimestamp ? catalogItem.status.updateTimestamp : catalogItem.metadata.creationTimestamp;
     return (<LocalTimestamp timestamp={ts}/>);
  }

  function description(catalogItem): string {
    if (catalogItem.metadata.annotations && catalogItem.metadata.annotations['babylon.gpte.redhat.com/description']) {
      return catalogItem.metadata.annotations['babylon.gpte.redhat.com/description'];
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

  function provider(catalogItem): string {
    if (catalogItem.metadata.labels && catalogItem.metadata.labels['babylon.gpte.redhat.com/provider']) {
      return catalogItem.metadata.labels['babylon.gpte.redhat.com/provider'];
    } else {
      return 'GPTE';
    }
  }

  function runtime(catalogItem): string {
    if (catalogItem.spec && catalogItem.spec.runtime) {
      return catalogItem.spec.runtime;
    } else {
      return '8 hours';
    }
  }

  function lifetime(catalogItem): string {
    if (catalogItem.spec && catalogItem.spec.lifetime) {
      return catalogItem.spec.lifetime;
    } else {
      return '3 days';
    }
  }

  function requestCatalogItem(): void {
    history.push({
      pathname: `/catalog/request/${catalogItemNamespace}/${catalogItemName}`,
      state: { fromCatalog: true },
    });
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
        __html: renderAsciiDoc(description(selectedCatalogItem), {allowIFrame: true})
      }}
    />
  ) : null;

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
            <div className="rhpds-catalog-item-subtitle">provided by {provider(selectedCatalogItem)}</div>
          </div>
        </div>
        <DrawerActions>
          <DrawerCloseButton onClick={unselectCatalogItem} />
        </DrawerActions>
      </DrawerHead>
      <PageSection variant={PageSectionVariants.light} className="rhpds-catalo-item-details-actions">
        <Button aria-label="Action" onClick={requestCatalogItem}>
          Request
        </Button>
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
                if (!label.startsWith('babylon.gpte.redhat.com/')) {
                  return false;
                }
                const attr = label.substring(24);
                return !['category'].includes(attr);
              })
              .map(label => {
                const attr = label.substring(24);
                const value = selectedCatalogItem.metadata.labels[label];
                return (
                  <DescriptionListGroup key={attr}>
                    <DescriptionListTerm>{attr.replace('_', ' ')}</DescriptionListTerm>
                    <DescriptionListDescription>{value}</DescriptionListDescription>
                  </DescriptionListGroup>
                );
              })
            }

            <DescriptionListTerm>Created At</DescriptionListTerm>
            <DescriptionListDescription>
              { creationTimestamp(selectedCatalogItem) }
            </DescriptionListDescription>

            <DescriptionListTerm>Last Updated At</DescriptionListTerm>
            <DescriptionListDescription>
              { updateTimestamp(selectedCatalogItem) }
            </DescriptionListDescription>

            <DescriptionListTerm>Runtime</DescriptionListTerm>
            <DescriptionListDescription>
              { runtime(selectedCatalogItem) }
            </DescriptionListDescription>

            <DescriptionListTerm>Lifetime</DescriptionListTerm>
            <DescriptionListDescription>
              { lifetime(selectedCatalogItem) }
            </DescriptionListDescription>

            <DescriptionListTerm>Support</DescriptionListTerm>
            <DescriptionListDescription>
              <a>Get Support <ExternalLinkAltIcon /></a>
            </DescriptionListDescription>
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
    (catalogNamespaceName ? (catalogItems[catalogNamespaceName] || []) : Object.values(catalogItems || []).flat())
  );

  const availableCatalogItems = allCatalogItems.filter(ci => {
    if (activeCategory !== 'all' && activeCategory !== category(ci)) {
      return false;
    }
    return true;
  });

  const filteredCatalogItems = availableCatalogItems.filter(ci => {
    const ciCategory = category(ci);
    if (keywordSearchValue) {
      let keywordMatch = false;
      const keywords = keywordSearchValue.trim().split();
      for (let i=0; i < keywords.length; ++i) {
        const keyword = keywords[i].toLowerCase();
        if (ci.metadata.name.toLowerCase().includes(keyword)
          || displayName(ci).toLowerCase().includes(keyword)
          || (ciCategory && ciCategory.toLowerCase().includes(keyword))
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
        if (keywordMatch) {
          break;
        }
      }
      if (!keywordMatch) {
        return false;
      }
    }

    for (const [attrKey, valueFilters] of Object.entries(selectedAttributeFilters)) {
      let attrMatch = null;
      for (const [valueKey, selected] of Object.entries(valueFilters)) {
        if (selected) {
          if (attrMatch === null) {
            attrMatch = false;
          }
          if (ci.metadata.labels) {
            for (const [label, value] of Object.entries(ci.metadata.labels)) {
              if (label.startsWith('babylon.gpte.redhat.com/')) {
                const attr = label.substring(24);
                if (attrKey == attr.toLowerCase() && valueKey == value.toLowerCase()) {
                  attrMatch = true;
                }
              }
            }
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
    allCatalogItems
    .map(ci => category(ci))
    .filter(category => category)
  ));
  categories.sort((a, b) => {
    const av = a.toUpperCase();
    const bv = b.toUpperCase();
    if (av == 'OTHER') {
      return 1;
    } else if( bv == 'OTHER') {
      return -1;
    } else {
      return av < bv ? -1 : av > bv ? 1 : 0;
    }
  });

  function extractAttributeFilters (catalogItems) {
    const attributeFilters = {};
    for (let i=0; i < catalogItems.length; ++i) {
      const ci = availableCatalogItems[i];
      if (!ci.metadata.labels) { continue; }
      for (const label in ci.metadata.labels) {
        if (!label.startsWith('babylon.gpte.redhat.com/')
          || label.toLowerCase() === 'babylon.gpte.redhat.com/category'
        ) {
          continue;
        }
        const attr = label.substring(24);
        const attrKey = attr.toLowerCase();
        const value = ci.metadata.labels[label];
        const valueKey = value.toLowerCase();
        if (!attributeFilters[attrKey]) {
          attributeFilters[attrKey] = {
            text: attr.replace('_', ' '),
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
            text: value.replace('_', ' '),
          }
        }
      }
    }
    return attributeFilters;
  }

  const attributeFilters = extractAttributeFilters(availableCatalogItems);

  const catalogItemCards = filteredCatalogItems.map(
    catalogItem => (
      <Link
        className="rhpds-catalog-item-card-link"
        key={catalogItem.metadata.uid}
        to={{
          pathname: catalogNamespace ? `${catalogPath}/item/${catalogItem.metadata.name}` :  `${catalogPath}/item/${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`,
          state: { fromCatalog: true },
        }}
      >
        <CardHeader className="rhpds-catalog-item-card-header">
          <CatalogItemIcon icon={icon(catalogItem)} />
          <div>
            <div>
          <Badge isRead>{badge(catalogItem)}</Badge>
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
          <div className="rhpds-catalog-item-subtitle">provided by {provider(catalogItem)}</div>
          <div
            className="rhpds-catalog-item-description"
            dangerouslySetInnerHTML={{__html: renderAsciiDoc(description(catalogItem))}}
          />
        </CardBody>
      </Link>
    )
  );

  const selectActiveCategory = (event, category) => {
    setActiveCategory(category);
  };

  const renderCategoryTab = (category: string) => (
    <Tab key={category} eventKey={category} title={<TabTitleText>{category.replace('_', ' ')}</TabTitleText>}></Tab>
  );

  return (
    <Drawer isExpanded={selectedCatalogItem}>
      <DrawerContent panelContent={selectedCatalogItemDisplay}>
        {selectedCatalogItem ? (<Backdrop />) : null}
        <DrawerContentBody>
          { (catalogNamespace || catalogNamespaces.length > 1) ? (
            <PageSection variant={PageSectionVariants.light} className="rhpds-project-select">
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
          <PageSection variant={PageSectionVariants.light} className="rhpds-catalog-header">
            <Title headingLevel="h1" size="2xl">RHPDS Catalog</Title>
            <div>Select an item to request a new service, demo, or lab.</div>
          </PageSection>
          <PageSection variant={PageSectionVariants.light}>
            <Card className="rhpds-catalog-box">
              <CardBody>
                <Sidebar>
                  <SidebarPanel>
                    <Tabs isVertical
                      activeKey={activeCategory}
                      onSelect={selectActiveCategory}
                      inset={{default: 'insetNone', sm: 'insetNone', md: 'insetNone', lg: 'insetNone', xl: 'insetNone', '2xl': 'insetNone'}}>
                      <Tab eventKey="all" title={<TabTitleText>All Items</TabTitleText>}></Tab>
                      { categories.map(cat => renderCategoryTab(cat)) }
                    </Tabs>
                    <Form>
                    { Object.entries(attributeFilters).sort().map( ([attrKey, attr]) => (
                      <FormGroup key={attrKey} label={attr.text} fieldId={attrKey}>
                      { Object.entries(attr.values).sort().map( ([valueKey, value]) => (
                        <Checkbox id={attrKey + '/' + valueKey} key={attrKey + '/' + valueKey}
                          label={value.text + ' (' + value.count + ')'}
                          isChecked={value.selected}
                          onChange={onAttributeFilterChange}
                        />
                      ))}
                      </FormGroup>
                    ))}
                    </Form>
                  </SidebarPanel>
                  <SidebarContent>
                    <PageSection variant={PageSectionVariants.light} className="rhpds-catalog-box-header">
                      <div className="rhpds-catalog-title">{activeCategory == 'all' ? 'All Items' : activeCategory.replace('_', ' ')}</div>
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

export { Catalog };
