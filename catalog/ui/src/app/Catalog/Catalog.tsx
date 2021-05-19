import * as React from 'react';

import {
  useSelector,
} from 'react-redux';

import {
  selectCatalogNamespaces,
} from '@app/store/authSlice';

import './catalog.css';

import {
  useHistory,
  useLocation,
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
  renderAsciiDoc
} from '@app/util';

import { CatalogItemIcon } from './CatalogItemIcon';
import { CatalogItemHealthDisplay } from './CatalogItemHealthDisplay';
import { CatalogItemRating } from './CatalogItemRating';
import { LocalTimestamp } from '../LocalTimestamp';

import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';

export interface CatalogProps {
  location?: any;
}

const Catalog: React.FunctionComponent<CatalogProps> = ({
  location,
}) => {
  const history = useHistory();

  const catalogNamespaceRouteMatch = useRouteMatch<IHostsMatchParams>('/catalog/:namespace');
  const catalogItemRouteMatch = useRouteMatch<IHostsMatchParams>('/catalog/:namespace/:name');

  const authCatalogNamespaces = useSelector(selectCatalogNamespaces);

  const catalogNamespace = (
    catalogItemRouteMatch ? catalogItemRouteMatch.params.namespace :
    catalogNamespaceRouteMatch ? catalogNamespaceRouteMatch.params.namespace : null
  );
  const catalogItemName = (
    catalogItemRouteMatch ? catalogItemRouteMatch.params.name : null
  );

  const [catalogItems, setCatalogItems] = React.useState({});
  const [catalogNamespaces, setCatalogNamespaces] = React.useState([]);
  const [activeCategory, setActiveCategory] = React.useState('all');
  const [selectedLabelFilters, setSelectedLabelFilters] = React.useState({});
  const [keywordSearchValue, setKeywordSearchValue] = React.useState('');

  const selectedCatalogItem = (
    catalogItemName && catalogItems[catalogNamespace]
    ? catalogItems[catalogNamespace].find(catalogItem => catalogItem.metadata.name === catalogItemName) : null
  );

  async function refreshCatalogFromNamespace(namespace): void {
    const resp = await listNamespacedCustomObject('babylon.gpte.redhat.com', 'v1', namespace.name, 'catalogitems');
    setCatalogItems((state) => {
      const copy = Object.assign({}, state);
      return Object.assign(copy, { [namespace.name]: resp.items })
    });
  }

  async function refreshCatalog(namespaces): void {
    if (namespaces) {
      namespaces.forEach(namespace => {
        refreshCatalogFromNamespace(namespace);
      })
    }
  }

  if (catalogNamespaces != authCatalogNamespaces) {
    console.log("Refreshing");
    setCatalogItems({});
    setCatalogNamespaces(authCatalogNamespaces);
    refreshCatalog(authCatalogNamespaces);
  } else {
    console.log(authCatalogNamespaces);
  }

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

  function displayName(item): string {
    if (item.metadata.annotations && item.metadata.annotations['babylon.gpte.redhat.com/displayName']) {
      return item.metadata.annotations['babylon.gpte.redhat.com/displayName'];
    } else {
      return item.metadata.name;
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
      pathname: `/catalog/${catalogNamespace}/${catalogItemName}/request`,
      state: { fromCatalog: true },
    });
  }

  function unselectCatalogItem(): void {
    if (location.state) {
      history.goBack();
    } else {
      history.push('/catalog');
    }
  }

  function onKeywordSearchChange(value): void {
    setKeywordSearchValue(value);
  }

  function onAttributeFilterChange(checked: boolean, event): void {
    const attributeFilterIdParts = event.target.id.split('/');
    setSelectedLabelFilters(value => {
      const ret = JSON.parse(JSON.stringify(value));
      if (ret[attributeFilterIdParts[0]]) {
        ret[attributeFilterIdParts[0]][attributeFilterIdParts[1]] = ret[attributeFilterIdParts[0]][attributeFilterIdParts[1]] ? false : true;
      } else {
        ret[attributeFilterIdParts[0]] = {[attributeFilterIdParts[1]]: true };
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
            <DescriptionListTerm>Rating</DescriptionListTerm>
            <DescriptionListDescription>
              <CatalogItemRating catalogItem={selectedCatalogItem} starDimension="20px" />
            </DescriptionListDescription>

            <DescriptionListTerm>Health</DescriptionListTerm>
            <DescriptionListDescription>
              <CatalogItemHealthDisplay catalogItem={selectedCatalogItem} />
            </DescriptionListDescription>

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
    (catalogNamespace ? (catalogItems[catalogNamespace] || []) : Object.values(catalogItems).flat())
  );

  const availableCatalogItems = allCatalogItems.filter(ci => {
    if (activeCategory !== 'all' && activeCategory !== category(ci)) {
      return false;
    }
    return true;
  });

  const filteredCatalogItems = availableCatalogItems.filter(ci => {
    if (keywordSearchValue) {
      let keywordMatch = false;
      const keywords = keywordSearchValue.trim().split();
      for (let i=0; i < keywords.length; ++i) {
        const keyword = keywords[i].toLowerCase();
        if (ci.metadata.name.toLowerCase().includes(keyword)
          || displayName(ci).toLowerCase().includes(keyword)
          || category(ci).toLowerCase().includes(keyword)
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

    for (const attr in selectedLabelFilters) {
      let attrMatch = null;
      for (const val in selectedLabelFilters[attr]) {
        if(selectedLabelFilters[attr][val]) {
          if (attrMatch === null) {
            attrMatch = false;
          }
          if (ci.metadata.labels && val == ci.metadata.labels['babylon.gpte.redhat.com/' + attr]) {
            attrMatch = true;
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
    .filter(category => category !== null)
  ));
  categories.sort((a, b) => {
    const av = a.toUpperCase();
    const bv = b.toUpperCase();
    return av < bv ? -1 : av > bv ? 1 : 0;
  })

  function extractLabelFilters (catalogItems) {
    const ret = {};
    for (let i=0; i < catalogItems.length; ++i) {
      const ci = availableCatalogItems[i];
      if (!ci.metadata.labels) { continue; }
      for (const label in ci.metadata.labels) {
        const value = ci.metadata.labels[label];
        if (label === 'babylon.gpte.redhat.com/category' || !label.startsWith('babylon.gpte.redhat.com/')) {
          continue;
        }
        const attr = label.substring(24);
        if (!ret[attr]) {
          ret[attr] = {}
        }
        if (ret[attr][value]) {
          ret[attr][value].count++;
        } else {
          ret[attr][value] = {
            count: 1,
            selected: selectedLabelFilters[attr] && selectedLabelFilters[attr][value],
          }
        }
      }
    }
    return ret;
  }

  const labelFilters = extractLabelFilters(availableCatalogItems);

  const catalogItemCards = filteredCatalogItems.map(
    catalogItem => (
      <Link
        className="rhpds-catalog-item-card-link"
        key={catalogItem.metadata.uid}
        to={{
          pathname: '/catalog/' + catalogItem.metadata.namespace + '/' + catalogItem.metadata.name,
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
                    { Object.keys(labelFilters).sort().map(attr => (
                      <FormGroup key={attr} label={attr.replace('_', ' ')} fieldId={attr}>
                      { Object.keys(labelFilters[attr]).sort().map(val => (
                        <Checkbox id={attr + '/' + val} key={attr + '/' + val}
                          label={val + ' (' + labelFilters[attr][val].count + ')'}
                          isChecked={labelFilters[attr][val].selected}
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
                    <PageSection variant={PageSectionVariants.default}  className="rhpds-catalog-box-items">
                      {catalogItemCards}
                    </PageSection>
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
