import React from 'react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Link, useHistory, useLocation, useRouteMatch } from 'react-router-dom';
import { useSelector } from 'react-redux';

import {
  Backdrop,
  Card,
  CardBody,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Sidebar,
  SidebarContent,
  SidebarPanel,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';

import { listCatalogItems } from '@app/api';
import { selectCatalogNamespaces, selectUserGroups } from '@app/store';
import { CatalogItem, CatalogItemList, CatalogNamespace } from '@app/types';
import { checkAccessControl, displayName, BABYLON_DOMAIN } from '@app/util';

import { K8sFetchState, cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';

import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';

import CatalogCategorySelector from './CatalogCategorySelector';
import CatalogInterfaceDescription from './CatalogInterfaceDescription';
import CatalogItemCard from './CatalogItemCard';
import CatalogItemDetails from './CatalogItemDetails';
import CatalogItemRequestForm from './CatalogItemRequestForm';
import CatalogItemWorkshopForm from './CatalogItemWorkshopForm';
import CatalogLabelSelector from './CatalogLabelSelector';
import CatalogNamespaceSelect from './CatalogNamespaceSelect';
import { getCategory } from './catalog-utils';

import './catalog.css';

const FETCH_BATCH_LIMIT = 50;

function compareCatalogItems(a: CatalogItem, b: CatalogItem): number {
  const aDisplayName = displayName(a);
  const bDisplayName = displayName(b);
  if (aDisplayName !== bDisplayName) {
    return aDisplayName < bDisplayName ? -1 : 1;
  }
  const aStage = a.metadata.labels?.[`${BABYLON_DOMAIN}/stage`];
  const bStage = b.metadata.labels?.[`${BABYLON_DOMAIN}/stage`];
  if (aStage !== bStage) {
    return aStage === 'prod' && bStage !== 'prod'
      ? -1
      : aStage !== 'prod' && bStage === 'prod'
      ? 1
      : aStage === 'test' && bStage !== 'test'
      ? -1
      : aStage !== 'test' && bStage === 'test'
      ? 1
      : aStage === 'dev' && bStage !== 'dev'
      ? -1
      : aStage !== 'dev' && bStage === 'dev'
      ? 1
      : 0;
  }
  if (a.metadata.namespace != b.metadata.namespace) {
    return a.metadata.namespace < b.metadata.namespace ? -1 : 1;
  }
  if (a.metadata.name != b.metadata.name) {
    return a.metadata.name < b.metadata.name ? -1 : 1;
  }
  return 0;
}

function filterCatalogItemByAccessControl(catalogItem: CatalogItem, userGroups: string[]): boolean {
  return 'deny' !== checkAccessControl(catalogItem.spec.accessControl, userGroups);
}

function filterCatalogItemByCategory(catalogItem: CatalogItem, selectedCategory: string): boolean {
  return selectedCategory === getCategory(catalogItem);
}

function filterCatalogItemByKeywords(catalogItem: CatalogItem, keywordFilter: string[]): boolean {
  const ciCategory = getCategory(catalogItem);
  const ciDescription = catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/description`];

  for (const keyword of keywordFilter) {
    const keywordLower = keyword.toLowerCase();

    let keywordMatch = null;

    if (
      catalogItem.metadata.name.toLowerCase().includes(keywordLower) ||
      displayName(catalogItem).toLowerCase().includes(keywordLower) ||
      (ciCategory && ciCategory.toLowerCase().includes(keywordLower)) ||
      (ciDescription && ciDescription.toLowerCase().includes(keywordLower))
    ) {
      keywordMatch = true;
    }

    if (!keywordMatch && catalogItem.metadata.labels) {
      for (const label in catalogItem.metadata.labels) {
        if (
          label.startsWith(`${BABYLON_DOMAIN}/`) &&
          catalogItem.metadata.labels[label].toLowerCase().includes(keywordLower)
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
  return true;
}

function filterCatalogItemByLabels(catalogItem: CatalogItem, labelFilter: { [attr: string]: string[] }): boolean {
  for (const [attr, values] of Object.entries(labelFilter)) {
    const matchAttr: string = attr.toLowerCase();
    const matchValues: string[] = values.map((v) => v.toLowerCase());
    let matched = false;
    for (const [ciLabel, ciValue] of Object.entries(catalogItem.metadata.labels || {})) {
      if (ciLabel.startsWith(`${BABYLON_DOMAIN}/`)) {
        const ciAttr = ciLabel
          .substring(BABYLON_DOMAIN.length + 1)
          .replace(/-[0-9]+$/, '')
          .toLowerCase();
        if (matchAttr === ciAttr && matchValues.includes(ciValue.toLowerCase())) {
          matched = true;
        }
      }
    }
    if (!matched) {
      return false;
    }
  }
  return true;
}

const Catalog: React.FunctionComponent = () => {
  const history = useHistory();
  const location = useLocation();
  const componentWillUnmount = useRef(false);
  const routeMatch = useRouteMatch<any>('/catalog/:namespace?');
  const catalogNamespaceName: string = routeMatch.params.namespace;
  const urlSearchParams = new URLSearchParams(location.search);
  const openCatalogItemParam: string | null = urlSearchParams.has('item') ? urlSearchParams.get('item') : null;
  const openCatalogItemNamespaceName: string | null = openCatalogItemParam
    ? openCatalogItemParam.includes('/')
      ? openCatalogItemParam.split('/')[0]
      : catalogNamespaceName
    : null;
  const openCatalogItemName: string | null = openCatalogItemParam
    ? openCatalogItemParam.includes('/')
      ? openCatalogItemParam.split('/')[1]
      : openCatalogItemParam
    : null;
  const keywordFilter: string[] | null = urlSearchParams.has('search')
    ? urlSearchParams
        .get('search')
        .trim()
        .split(/ +/)
        .filter((w) => w != '')
    : null;
  const showRequestForm: boolean = urlSearchParams.get('request') === 'service';
  const showWorkshopForm: boolean = urlSearchParams.get('request') === 'workshop';
  const selectedCategory = urlSearchParams.has('category') ? urlSearchParams.get('category') : null;
  const selectedLabels: { [label: string]: string[] } = urlSearchParams.has('labels')
    ? JSON.parse(urlSearchParams.get('labels'))
    : null;

  const catalogNamespaces: CatalogNamespace[] = useSelector(selectCatalogNamespaces);
  const catalogNamespaceNames: string[] | null = catalogNamespaces.map((ci) => ci.name);
  const userGroups: string[] = useSelector(selectUserGroups);

  const [fetchState, reduceFetchState] = useReducer(k8sFetchStateReducer, null);
  const catalogItems: CatalogItem[] = (fetchState?.filteredItems as CatalogItem[]) || [];
  catalogItems.sort(compareCatalogItems);

  const categoryFilteredCatalogItems: CatalogItem[] = selectedCategory
    ? catalogItems.filter((catalogItem) => filterCatalogItemByCategory(catalogItem, selectedCategory))
    : catalogItems;
  const searchFilteredCatalogItems: CatalogItem[] = keywordFilter
    ? categoryFilteredCatalogItems.filter((catalogItem) => filterCatalogItemByKeywords(catalogItem, keywordFilter))
    : categoryFilteredCatalogItems;
  const labelFilteredCatalogItems: CatalogItem[] = selectedLabels
    ? searchFilteredCatalogItems.filter((catalogItem) => filterCatalogItemByLabels(catalogItem, selectedLabels))
    : searchFilteredCatalogItems;

  const openCatalogItem: CatalogItem =
    openCatalogItemName && openCatalogItemNamespaceName
      ? catalogItems.find(
          (item) =>
            item.metadata.name === openCatalogItemName && item.metadata.namespace === openCatalogItemNamespaceName
        )
      : null;

  function closeCatalogItem(): void {
    urlSearchParams.delete('item');
    history.push(`${location.pathname}?${urlSearchParams.toString()}`);
  }

  function onKeywordSearchChange(value: string[]): void {
    if (value) {
      urlSearchParams.set('search', value.join(' '));
    } else if (urlSearchParams.has('search')) {
      urlSearchParams.delete('search');
    }
    history.push(`${location.pathname}?${urlSearchParams.toString()}`);
  }

  function onRequestCancel(): void {
    urlSearchParams.delete('request');
    history.push(`${location.pathname}?${urlSearchParams.toString()}`);
  }

  function onSelectCatalogNamespace(namespaceName: string | null): void {
    if (namespaceName) {
      history.push(`/catalog/${namespaceName}${location.search}`);
    } else {
      history.push(`/catalog${location.search}`);
    }
  }

  function onSelectCategory(category: string | null): void {
    if (category) {
      urlSearchParams.set('category', category);
    } else if (urlSearchParams.has('category')) {
      urlSearchParams.delete('category');
    }
    history.push(`${location.pathname}?${urlSearchParams.toString()}`);
  }

  function onSelectLabels(labels: { [label: string]: string[] } | null): void {
    if (labels) {
      urlSearchParams.set('labels', JSON.stringify(labels));
    } else if (urlSearchParams.has('labels')) {
      urlSearchParams.delete('labels');
    }
    history.push(`${location.pathname}?${urlSearchParams.toString()}`);
  }

  async function fetchCatalogItems(): Promise<void> {
    const catalogItemList: CatalogItemList = await listCatalogItems({
      continue: fetchState.continue,
      limit: FETCH_BATCH_LIMIT,
      namespace: fetchState.namespace,
    });
    if (!fetchState.activity.canceled) {
      reduceFetchState({
        type: 'post',
        k8sObjectList: catalogItemList,
      });
    }
  }

  // Track unmount for other effect cleanups
  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Trigger initial fetch and refresh on catalog namespace update
  useEffect(() => {
    if (catalogNamespaceNames.length > 0) {
      const setNamespaces = catalogNamespaceName ? [catalogNamespaceName] : catalogNamespaceNames;
      const filterFunction = (item) => filterCatalogItemByAccessControl(item, userGroups);
      if (JSON.stringify(setNamespaces) !== JSON.stringify(fetchState?.namespaces)) {
        reduceFetchState({
          type: 'startFetch',
          filter: filterFunction,
          namespaces: setNamespaces,
        });
      } else {
        reduceFetchState({
          type: 'modify',
          filter: filterFunction,
        });
      }
    }
  }, [catalogNamespaceName, JSON.stringify(catalogNamespaceNames), JSON.stringify(keywordFilter), selectedCategory]);

  useEffect(() => {
    if (fetchState) {
      if (fetchState.canContinue) {
        fetchCatalogItems();
      } else {
        // Clear selected category if no catalog items match
        if (selectedCategory && !catalogItems.find((ci) => selectedCategory === getCategory(ci))) {
          urlSearchParams.delete('category');
          history.push(`${location.pathname}?${urlSearchParams.toString()}`);
        }
      }
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(fetchState);
      }
    };
  }, [fetchState]);

  if (showRequestForm || showWorkshopForm) {
    if (openCatalogItem) {
      if (showWorkshopForm) {
        return <CatalogItemWorkshopForm catalogItem={openCatalogItem} onCancel={onRequestCancel} />;
      }
      return <CatalogItemRequestForm catalogItem={openCatalogItem} onCancel={onRequestCancel} />;
    } else if (fetchState?.finished) {
      return (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              Catalog item not found.
            </Title>
            <EmptyStateBody>
              CatalogItem {openCatalogItemName} was not found in {openCatalogItemNamespaceName}
            </EmptyStateBody>
          </EmptyState>
        </PageSection>
      );
    }

    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <Drawer isExpanded={openCatalogItem ? true : false}>
      <DrawerContent
        panelContent={
          openCatalogItem ? <CatalogItemDetails catalogItem={openCatalogItem} onClose={closeCatalogItem} /> : null
        }
      >
        {openCatalogItem ? <Backdrop /> : null}
        <DrawerContentBody>
          {catalogNamespaces.length > 1 ? (
            <CatalogNamespaceSelect onSelect={onSelectCatalogNamespace} selected={catalogNamespaceName} />
          ) : null}
          <CatalogInterfaceDescription />
          <PageSection className="catalog-body" variant={PageSectionVariants.light}>
            <Card>
              <CardBody>
                <Sidebar>
                  <SidebarPanel className="catalog-body-sidebar-panel">
                    <CatalogCategorySelector
                      catalogItems={catalogItems}
                      onSelect={onSelectCategory}
                      selected={selectedCategory}
                    />
                    <CatalogLabelSelector
                      catalogItems={catalogItems}
                      filteredCatalogItems={searchFilteredCatalogItems}
                      onSelect={onSelectLabels}
                      selected={selectedLabels}
                    />
                  </SidebarPanel>
                  <SidebarContent>
                    <PageSection variant={PageSectionVariants.light} className="catalog-body-header">
                      <Split>
                        <SplitItem isFilled>
                          <Title headingLevel="h2">
                            {selectedCategory ? selectedCategory.replace(/_/g, ' ') : 'All Items'}
                          </Title>
                          <KeywordSearchInput
                            initialValue={keywordFilter}
                            placeholder="Filter by keyword..."
                            onSearch={onKeywordSearchChange}
                          />
                        </SplitItem>
                        <SplitItem className="catalog-item-count">
                          {labelFilteredCatalogItems.length === 1
                            ? '1 item'
                            : `${labelFilteredCatalogItems.length} items`}
                        </SplitItem>
                      </Split>
                    </PageSection>
                    {catalogItems.length > 0 ? (
                      <PageSection variant={PageSectionVariants.default} className="catalog-content-box">
                        {labelFilteredCatalogItems.map((catalogItem) => (
                          <CatalogItemCard key={catalogItem.metadata.uid} catalogItem={catalogItem} />
                        ))}
                      </PageSection>
                    ) : (
                      <PageSection variant={PageSectionVariants.default} className="catalog-content-box-empty">
                        {fetchState?.finished || fetchState?.refreshing ? (
                          <EmptyState variant="full">No catalog items match filters.</EmptyState>
                        ) : (
                          <EmptyState variant="full">
                            <EmptyStateIcon icon={LoadingIcon} />
                          </EmptyState>
                        )}
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
};

export default Catalog;
