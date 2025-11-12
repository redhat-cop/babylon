import React, { Suspense, useCallback, useLayoutEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  Backdrop,
  Button,
  Card,
  CardBody,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  DrawerPanelContent,
  EmptyState,
  PageSection,
  Sidebar,
  SidebarContent,
  SidebarPanel,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Title,
  Tooltip,
  Select,
  SelectOption,
  SelectList,
  MenuToggleElement,
  MenuToggle,
} from '@patternfly/react-core';
import DownloadIcon from '@patternfly/react-icons/dist/js/icons/download-icon';
import ListIcon from '@patternfly/react-icons/dist/js/icons/list-icon';
import ThIcon from '@patternfly/react-icons/dist/js/icons/th-icon';
import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';
import useSWRImmutable from 'swr/immutable';
import { AsyncParser } from 'json2csv';
import { apiPaths, fetcher, fetcherItemsInAllPages } from '@app/api';
import { Bookmark, BookmarkList, CatalogItem, CatalogItemIncidents } from '@app/types';
import useSession from '@app/utils/useSession';
import SearchInputString from '@app/components/SearchInputString';
import {
  checkAccessControl,
  displayName,
  BABYLON_DOMAIN,
  FETCH_BATCH_LIMIT,
  stripTags,
  CATALOG_MANAGER_DOMAIN,
  GPTE_DOMAIN,
  getStageFromK8sObject,
} from '@app/util';
import LoadingIcon from '@app/components/LoadingIcon';
import Footer from '@app/components/Footer';
import {
  formatString,
  getCategory,
  HIDDEN_ANNOTATIONS,
  HIDDEN_LABELS,
  CUSTOM_LABELS,
  getStatusFromCatalogItem,
  getRating,
} from './catalog-utils';
import CatalogCategorySelector from './CatalogCategorySelector';
import CatalogInterfaceDescription from './CatalogInterfaceDescription';
import CatalogItemDetails from './CatalogItemDetails';
import CatalogLabelSelector from './CatalogLabelSelector';
import CatalogNamespaceSelect from './CatalogNamespaceSelect';
import CatalogContent from './CatalogContent';
import LoadingSection from '@app/components/LoadingSection';

import './catalog.css';

const DEFAULT_CATEGORIES = ['Demos', 'Labs', 'Workshops', 'Open_Environments'];

function handleExportCsv(catalogItems: CatalogItem[]) {
  const annotations = [];
  const labels = [];
  catalogItems.forEach((ci) => {
    for (const annotation of Object.keys(ci.metadata.annotations || [])) {
      if (
        annotation.startsWith(BABYLON_DOMAIN + '/') &&
        !HIDDEN_ANNOTATIONS.includes(annotation.substring(BABYLON_DOMAIN.length + 1))
      ) {
        if (!annotations.includes(annotation)) annotations.push(annotation);
      }
    }
    for (const label of Object.keys(ci.metadata.labels || [])) {
      if (
        label.startsWith(BABYLON_DOMAIN + '/') ||
        (label.startsWith(GPTE_DOMAIN + '/') && !HIDDEN_LABELS.includes(label.substring(BABYLON_DOMAIN.length + 1)))
      ) {
        if (!labels.includes(label)) labels.push(label);
      }
    }
  });

  const fields = [
    {
      label: 'Name',
      value: 'metadata.name',
      default: '',
    },
    {
      label: 'Catalog',
      value: 'metadata.namespace',
      default: '',
    },
  ];
  for (const annotation of annotations) {
    fields.push({
      label: formatString(annotation.substring(BABYLON_DOMAIN.length + 1)),
      value: `metadata.annotations.["${annotation}"]`,
      default: '',
    });
  }
  for (const label of labels) {
    fields.push({
      label: formatString(
        label.startsWith(BABYLON_DOMAIN + '/')
          ? label.substring(BABYLON_DOMAIN.length + 1)
          : label.substring(GPTE_DOMAIN.length + 1),
      ),
      value: `metadata.labels.["${label}"]`,
      default: '',
    });
  }
  const opts = { fields };
  const transformOpts = { objectMode: true };
  const asyncParser = new AsyncParser(opts, transformOpts);

  let csv = '';
  asyncParser.processor
    .on('data', (chunk) => (csv += chunk.toString()))
    .on('end', () => {
      const url = window.URL.createObjectURL(new Blob([csv], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.style.display = 'none';
      link.setAttribute('href', url);
      link.setAttribute('download', 'demo-redhat-catalog.csv');
      document.body.appendChild(link);
      link.click();
    });
  catalogItems.forEach((ci) => asyncParser.input.push(ci));
  asyncParser.input.push(null);
}

function filterCatalogItemByAccessControl(catalogItem: CatalogItem, userGroups: string[], isAdmin: boolean) {
  return 'deny' !== checkAccessControl(catalogItem.spec.accessControl, userGroups, isAdmin);
}

function filterCatalogItemByCategory(catalogItem: CatalogItem, selectedCategory: string) {
  return selectedCategory === getCategory(catalogItem);
}
function filterFavorites(catalogItem: CatalogItem, favList: Bookmark[] = []) {
  return favList.some((f) => f.asset_uuid === catalogItem.metadata?.labels?.['gpte.redhat.com/asset-uuid']);
}

function filterCatalogItemByLabels(catalogItem: CatalogItem, labelFilter: { [attr: string]: string[] }): boolean {
  for (const [attr, values] of Object.entries(labelFilter)) {
    const matchAttr = attr.toLowerCase();
    const matchValues = values.map((v) => v.toLowerCase());
    let matched = false;
    for (const [ciLabel, ciValue] of Object.entries(catalogItem.metadata.labels || {})) {
      if (ciLabel.startsWith(`${BABYLON_DOMAIN}/`)) {
        const ciAttr = ciLabel
          .substring(BABYLON_DOMAIN.length + 1)
          .replace(/-[0-9]+$/, '')
          .toLowerCase();
        if (matchAttr === ciAttr) {
          if (matchValues.includes(ciValue.toLowerCase())) {
            matched = true;
          }
        }
      }
      if (ciLabel.startsWith(`${CATALOG_MANAGER_DOMAIN}/`)) {
        const ciAttr = ciLabel
          .substring(CATALOG_MANAGER_DOMAIN.length + 1)
          .replace(/-[0-9]+$/, '')
          .toLowerCase();
        if (matchAttr === ciAttr) {
          if (ciAttr === CUSTOM_LABELS.RATING.key) {
            if (parseInt(ciValue, 10) >= parseInt(matchValues[0], 10)) matched = true;
          } else if (matchValues.includes(ciValue.toLowerCase())) {
            matched = true;
          }
        }
      }
    }
    if (!matched) {
      return false;
    }
  }
  return true;
}

function filterCatalogItemByAdminFilter(catalogItem: CatalogItem, statuses: string[]) {
  if (!statuses || statuses.length === 0) return true;
  const ann = catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`];
  if (ann) {
    const ops = JSON.parse(ann);
    if (ops.status?.id && statuses && statuses.includes(ops.status.id)) {
      return true;
    }
  } else {
    return statuses && statuses.includes('operational');
  }
  return false;
}

export async function fetchCatalog(namespaces: string[]): Promise<CatalogItem[]> {
  async function fetchNamespace(namespace: string): Promise<CatalogItem[]> {
    return await fetcherItemsInAllPages((continueId) =>
      apiPaths.CATALOG_ITEMS({ namespace, limit: FETCH_BATCH_LIMIT, continueId }),
    );
  }
  const catalogItems: CatalogItem[] = [];
  const namespacesPromises = [];
  for (const namespace of namespaces) {
    namespacesPromises.push(fetchNamespace(namespace).then((cis) => catalogItems.push(...cis)));
  }
  await Promise.all(namespacesPromises);
  return catalogItems;
}

const Catalog: React.FC<{ userHasRequiredPropertiesToAccess: boolean }> = ({ userHasRequiredPropertiesToAccess }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { namespace: catalogNamespaceName } = useParams();
  const isFavoritesPage = location.pathname.startsWith('/catalog/favorites');
  const { catalogNamespaces, groups, isAdmin } = useSession().getSession();
  const [view, setView] = useState<'gallery' | 'list'>('gallery');
  const [sortBy, setSortBy] = useState<{ isOpen: boolean; selected: 'Featured' | 'Rating' | 'AZ' | 'ZA' }>({
    isOpen: false,
    selected: 'Featured',
  });
  const openCatalogItemParam = searchParams.has('item') ? searchParams.get('item') : null;
  const openCatalogItemNamespaceName = openCatalogItemParam
    ? openCatalogItemParam.includes('/')
      ? openCatalogItemParam.split('/')[0]
      : catalogNamespaceName
    : null;
  const openCatalogItemName = openCatalogItemParam
    ? openCatalogItemParam.includes('/')
      ? openCatalogItemParam.split('/')[1]
      : openCatalogItemParam
    : null;

  const searchString = searchParams.has('search') ? searchParams.get('search').trim() : null;
  const selectedCategories: string[] = useMemo(() => {
    if (searchParams.has('categories')) {
      try {
        const categories = JSON.parse(searchParams.get('categories'));
        // Return empty array if explicitly set to empty, otherwise return the parsed categories
        return categories;
      } catch {
        return [];
      }
    }
    // Default categories for regular catalog page (not favorites)
    if (!isFavoritesPage) {
      return [...DEFAULT_CATEGORIES];
    }
    // Default to empty (show all items)
    return [];
  }, [searchParams, isFavoritesPage]);
  const labelsString = searchParams.has('labels') ? searchParams.get('labels') : null;
  const adminStatusString = searchParams.has('adminStatus') ? searchParams.get('adminStatus') : null;
  const selectedAdminFilter: string[] = useMemo(
    () => (adminStatusString ? JSON.parse(adminStatusString) : []),
    [adminStatusString],
  );
  const selectedLabels: { [label: string]: string[] } = useMemo(
    () => (labelsString ? JSON.parse(labelsString) : {}),
    [labelsString],
  );

  const [searchInputStringCb, setSearchInputStringCb] = useState<(val: string) => void>(null);
  const assignSearchInputStringCb = (cb: (v: string) => void) => setSearchInputStringCb(cb);
  const catalogNamespaceNames = catalogNamespaces.map((ci) => ci.name);

  // sync input with search param
  useLayoutEffect(() => {
    if (searchString && searchInputStringCb) {
      searchInputStringCb(searchString);
    }
  }, [searchString, searchInputStringCb]);

  // Set default categories in URL params if not already set (only for regular catalog page)
  // Don't set defaults if categories is explicitly set to empty array
  useLayoutEffect(() => {
    if (!searchParams.has('category') && !isFavoritesPage) {
      if (!searchParams.has('categories')) {
        // No categories param at all - set defaults
        searchParams.set('categories', JSON.stringify(DEFAULT_CATEGORIES));
        setSearchParams(searchParams, { replace: true });
      }
      // If categories param exists (even if empty), leave it as is
    }
  }, [isFavoritesPage, searchParams, setSearchParams]);

  const compareCatalogItems = useCallback(
    (a: CatalogItem, b: CatalogItem): number => {
      const aDisplayName = displayName(a);
      const bDisplayName = displayName(b);
      if (aDisplayName !== bDisplayName) {
        if (sortBy.selected === 'AZ') {
          return aDisplayName < bDisplayName ? -1 : 1;
        } else if (sortBy.selected === 'ZA') {
          return aDisplayName < bDisplayName ? 1 : -1;
        } else {
          // sortBy === 'Featured' and 'Rating'
          if (sortBy.selected === 'Featured') {
            const selector = `${CUSTOM_LABELS.FEATURED_SCORE.domain}/${CUSTOM_LABELS.FEATURED_SCORE.key}`;
            const aRating = a.metadata.labels?.[selector];
            const bRating = b.metadata.labels?.[selector];
            if (aRating || bRating) {
              if (aRating && bRating) return parseInt(aRating, 10) < parseInt(bRating, 10) ? 1 : -1;
              if (bRating) return 1;
              return -1;
            }
          } else if (sortBy.selected === 'Rating') {
            // Rating sorting with weighted score considering number of ratings
            // Uses logarithmic scale to give diminishing returns boost based on rating count
            const MIN_RATINGS_FOR_BOOST = 3; // Minimum ratings to receive any boost
            const RATING_LOG_BASE = 50; // Base for logarithmic scaling (higher = less aggressive boost)
            const MAX_BOOST = 0.15; // Maximum boost percentage (15%)
            
            const aRatingData = getRating(a);
            const bRatingData = getRating(b);
            
            if (aRatingData || bRatingData) {
              if (aRatingData && bRatingData) {
                const aRatingCount = aRatingData.totalRatings || 0;
                const bRatingCount = bRatingData.totalRatings || 0;
                
                // Calculate boost using logarithmic scale: log(ratingCount + 1) / log(base)
                // This gives diminishing returns as rating count increases
                const aBoost = aRatingCount >= MIN_RATINGS_FOR_BOOST
                  ? MAX_BOOST * Math.log(aRatingCount + 1) / Math.log(RATING_LOG_BASE)
                  : 0;
                const bBoost = bRatingCount >= MIN_RATINGS_FOR_BOOST
                  ? MAX_BOOST * Math.log(bRatingCount + 1) / Math.log(RATING_LOG_BASE)
                  : 0;
                
                // Weighted score = rating * (1 + boost)
                const aWeightedScore = aRatingData.ratingScore * (1 + aBoost);
                const bWeightedScore = bRatingData.ratingScore * (1 + bBoost);
                
                if (Math.abs(aWeightedScore - bWeightedScore) > 0.001) {
                  return aWeightedScore < bWeightedScore ? 1 : -1;
                }
                // If weighted scores are very close, prioritize items with more ratings
                if (aRatingCount !== bRatingCount) {
                  return aRatingCount < bRatingCount ? 1 : -1;
                }
                // If everything is equal, fall back to rating score
                return aRatingData.ratingScore < bRatingData.ratingScore ? 1 : -1;
              }
              if (bRatingData) return 1;
              return -1;
            }
          }
          return aDisplayName < bDisplayName ? -1 : 1;
        }
      }
      const stageSelector = `${CUSTOM_LABELS.STAGE.domain}/${CUSTOM_LABELS.STAGE.key}`;
      const aStage = a.metadata.labels?.[stageSelector];
      const bStage = b.metadata.labels?.[stageSelector];
      if (aStage !== bStage) {
        return aStage === 'prod' && bStage !== 'prod'
          ? -1
          : aStage !== 'prod' && bStage === 'prod'
            ? 1
            : aStage === 'event' && bStage !== 'event'
              ? -1
              : aStage !== 'event' && bStage === 'event'
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
    },
    [sortBy.selected],
  );

  const { data: activeIncidents, isLoading } = useSWRImmutable<CatalogItemIncidents>(
    apiPaths.CATALOG_ITEMS_ACTIVE_INCIDENTS({
      stage: catalogNamespaceName ? catalogNamespaceName.split('-').slice(-1)[0] : 'all',
    }),
    fetcher,
    {
      suspense: false,
      shouldRetryOnError: false,
    },
  );
  const { data: catalogItemsArr } = useSWRImmutable<CatalogItem[]>(
    apiPaths.CATALOG_ITEMS({
      namespace: catalogNamespaceName ? catalogNamespaceName : 'all-catalogs',
    }),
    () => fetchCatalog(catalogNamespaceName ? [catalogNamespaceName] : catalogNamespaceNames),
  );
  const { data: assetsFavList } = useSWRImmutable<BookmarkList>(apiPaths.FAVORITES(), fetcher, {
    suspense: false,
    shouldRetryOnError: false,
  });

  const catalogItems = useMemo(
    () => catalogItemsArr.filter((ci) => filterCatalogItemByAccessControl(ci, groups, isAdmin)),
    [catalogItemsArr, groups, isAdmin],
  );

  // Filter & Sort catalog items
  const [_catalogItems, _catalogItemsCpy] = useMemo(() => {
    const catalogItemsCpy = [...catalogItems].sort(compareCatalogItems);
    catalogItemsCpy.forEach((c, i) => {
      if (c.spec.description) {
        catalogItemsCpy[i].spec.description.safe = stripTags(c.spec.description.content);
      }
      const incident = activeIncidents
        ? activeIncidents.items.find(
            (i) =>
              i.asset_uuid === c.metadata.labels?.['gpte.redhat.com/asset-uuid'] &&
              i.stage === getStageFromK8sObject(c),
          )
        : null;
      if (incident) {
        catalogItemsCpy[i].metadata.annotations[`${BABYLON_DOMAIN}/incident`] = JSON.stringify(incident);
      }
    });
    const options = {
      minMatchCharLength: 3,
      threshold: 0,
      ignoreLocation: true,
      fieldNormWeight: 0,
      useExtendedSearch: true,
      keys: [
        {
          name: ['spec', 'displayName'],
          weight: 10,
        },
        {
          name: ['metadata', 'name'],
          weight: 10,
        },
        {
          name: ['spec', 'keywords'],
          weight: 5,
        },
        {
          name: ['metadata', 'labels', 'babylon.gpte.redhat.com/Sales_Play'],
          weight: 3,
        },
        {
          name: ['spec', 'description', 'safe'],
          weight: 3,
        },
        {
          name: ['metadata', 'labels', 'babylon.gpte.redhat.com/Provider'],
          weight: 2.5,
        },
        {
          name: ['metadata', 'labels', 'babylon.gpte.redhat.com/Product'],
          weight: 1,
        },
        {
          name: ['metadata', 'labels', 'babylon.gpte.redhat.com/Product_Family'],
          weight: 0.5,
        },
      ],
    };
    const catalogItemsFuse = new Fuse(catalogItemsCpy, options);
    if (selectedCategories && selectedCategories.length > 0) {
      catalogItemsFuse.remove((ci) => {
        // Check if item matches any selected category (OR logic)
        return !selectedCategories.some((category) => {
            return filterCatalogItemByCategory(ci, category);
        });
      });
    }
    if (isFavoritesPage) {
      catalogItemsFuse.remove((ci) => !filterFavorites(ci, assetsFavList?.bookmarks || []));
    }
    if (selectedLabels) {
      catalogItemsFuse.remove((ci) => !filterCatalogItemByLabels(ci, selectedLabels));
    }
    if (isAdmin && selectedAdminFilter) {
      catalogItemsFuse.remove((ci) => !filterCatalogItemByAdminFilter(ci, selectedAdminFilter));
    }
    return [catalogItemsFuse, catalogItemsCpy];
  }, [catalogItems, compareCatalogItems, selectedCategories, isFavoritesPage, assetsFavList?.bookmarks, selectedLabels, isAdmin, selectedAdminFilter, activeIncidents]);

  const catalogItemsResult = useMemo(() => {
    const items = searchString
      ? _catalogItems.search("'" + searchString.split(' ').join(" '")).map((x) => x.item)
      : _catalogItemsCpy;
    const operationalItems = [];
    const disabledItems = [];
    for (let catalogItem of items) {
      const status = getStatusFromCatalogItem(catalogItem);
      if (status) {
        const isDisabled = status.disabled;
        const statusName = status.name;
        if (statusName === 'Under maintenance' || isDisabled) {
          disabledItems.push(catalogItem);
        } else {
          operationalItems.push(catalogItem);
        }
      }
    }
    return operationalItems.concat(disabledItems);
  }, [searchString, _catalogItems, _catalogItemsCpy]);

  const openCatalogItem =
    openCatalogItemName && openCatalogItemNamespaceName
      ? catalogItems.find(
          (item) =>
            item.metadata.name === openCatalogItemName && item.metadata.namespace === openCatalogItemNamespaceName,
        )
      : null;

  function closeCatalogItem() {
    searchParams.delete('item');
    setSearchParams(searchParams);
  }

  function onSearchChange(value: string) {
    if (value) {
      searchParams.set('search', value);
    } else if (searchParams.has('search')) {
      searchParams.delete('search');
    }
    setSearchParams(searchParams);
  }

  function onSelectCatalogNamespace(namespaceName: string) {
    if (isFavoritesPage) {
      if (namespaceName) {
        navigate(`/catalog/favorites/${namespaceName}${location.search}`);
      } else {
        navigate(`/catalog/favorites${location.search}`);
      }
    } else {
      if (namespaceName) {
        navigate(`/catalog/${namespaceName}${location.search}`);
      } else {
        navigate(`/catalog${location.search}`);
      }
    }
  }

  function onSelectCategories(categories: string[]) {
    // Always set the categories param, even if empty, to prevent defaults from being reapplied
    searchParams.set('categories', JSON.stringify(categories || []));
    setSearchParams(searchParams);
  }

  function onSelectLabels(labels: { [label: string]: string[] }) {
    if (labels) {
      searchParams.set('labels', JSON.stringify(labels));
    } else if (searchParams.has('labels')) {
      searchParams.delete('labels');
    }
    setSearchParams(searchParams);
  }

  function onClearFilters() {
    const newParams = new URLSearchParams();
    // Explicitly set empty categories array to uncheck all categories
    newParams.set('categories', JSON.stringify([]));
    setSearchParams(newParams);
    if (searchInputStringCb) searchInputStringCb('');
  }

  // Check if there are any active filters (including default categories)
  const hasActiveFilters = useMemo(() => {
    const hasSearch = !!searchString;
    const hasLabels = selectedLabels && Object.keys(selectedLabels).length > 0;
    const hasAdminFilter = isAdmin && selectedAdminFilter && selectedAdminFilter.length > 0;
    const hasCategories = selectedCategories.length > 0;
    return hasSearch || hasLabels || hasAdminFilter || hasCategories;
  }, [searchString, selectedLabels, selectedAdminFilter, selectedCategories, isAdmin]);

  if (isLoading) {
    return <LoadingSection />;
  }

  return (
    <>
      <Drawer isExpanded={openCatalogItem ? true : false}>
        <DrawerContent
          panelContent={
            openCatalogItem ? (
              <Suspense
                fallback={
                  <DrawerPanelContent
                    widths={{ default: 'width_75', lg: 'width_75', xl: 'width_66', '2xl': 'width_50' }}
                  >
                    <PageSection hasBodyWrapper={false}>
                      <EmptyState icon={LoadingIcon} variant="full"></EmptyState>
                    </PageSection>
                  </DrawerPanelContent>
                }
              >
                <CatalogItemDetails catalogItem={openCatalogItem} onClose={closeCatalogItem} />
              </Suspense>
            ) : null
          }
        >
          {openCatalogItem ? <Backdrop /> : null}
          <DrawerContentBody>
            {catalogNamespaces.length > 1 ? (
              <CatalogNamespaceSelect onSelect={onSelectCatalogNamespace} selected={catalogNamespaceName} />
            ) : null}
            <CatalogInterfaceDescription />
            <PageSection hasBodyWrapper={false} className="catalog__body">
              <Card>
                <CardBody style={{ padding: 0 }}>
                  <Sidebar tabIndex={0}>
                    <SidebarPanel style={{ marginTop: 'var(--pf-t--global--spacer--xl)', borderLeft: '1px solid var(--pf-v6-c-card--BorderColor)', padding: '0 var(--pf-t--global--spacer--md)' }}>
                      <Stack hasGutter>
                        {hasActiveFilters && (
                          <StackItem>
                            <Button
                              variant="secondary"
                              icon={<TimesIcon />}
                              onClick={onClearFilters}
                              size="sm"
                            >
                              Clear all filters
                            </Button>
                          </StackItem>
                        )}
                        <StackItem>
                          <CatalogCategorySelector
                            catalogItems={catalogItems}
                            onSelect={onSelectCategories}
                            selected={selectedCategories}
                          />
                        </StackItem>
                        <StackItem>
                          <CatalogLabelSelector
                            catalogItems={catalogItems}
                            filteredCatalogItems={catalogItemsResult}
                            onSelect={onSelectLabels}
                            selected={selectedLabels}
                          />
                        </StackItem>
                      </Stack>
                    </SidebarPanel>
                    <SidebarContent style={{ overflow: 'hidden' }}>
                      <PageSection hasBodyWrapper={false} className="catalog__header">
                        <Split>
                          <SplitItem isFilled>
                            <Stack hasGutter>
                              <StackItem>
                                <Title headingLevel="h2">
                                  {selectedCategories && selectedCategories.length > 0
                                      ? selectedCategories.length === 1
                                        ? formatString(selectedCategories[0])
                                        : `${selectedCategories.length} Categories Selected`
                                      : 'All Items'}
                                </Title>
                              </StackItem>
                              <StackItem>
                                <SearchInputString
                                  initialValue={searchString}
                                  placeholder="Search"
                                  onSearch={onSearchChange}
                                  className="catalog__searchbox"
                                  setValueCb={assignSearchInputStringCb}
                                />
                              </StackItem>
                            </Stack>
                          </SplitItem>
                          <SplitItem>
                            <Stack hasGutter>
                              <StackItem>
                                <ul className="catalog__right-tools">
                                  <li>
                                    <Tooltip content="Gallery view">
                                      <Button
                                        icon={<ThIcon />}
                                        variant="plain"
                                        aria-label="View as gallery"
                                        onClick={() => setView('gallery')}
                                        isClicked={view === 'gallery'}
                                      />
                                    </Tooltip>
                                  </li>
                                  <li>
                                    <Tooltip content="List view">
                                      <Button
                                        icon={<ListIcon />}
                                        variant="plain"
                                        aria-label="View as list"
                                        onClick={() => setView('list')}
                                        isClicked={view === 'list'}
                                      />
                                    </Tooltip>
                                  </li>
                                  <li>
                                    <Tooltip content="Export to CSV">
                                      <Button
                                        icon={<DownloadIcon />}
                                        variant="plain"
                                        aria-label="Export to CSV"
                                        onClick={() => handleExportCsv(catalogItems)}
                                      />
                                    </Tooltip>
                                  </li>
                                  <li>
                                    <Select
                                      aria-label="Sort by"
                                      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                                        <MenuToggle
                                          ref={toggleRef}
                                          onClick={() =>
                                            setSortBy({
                                              ...sortBy,
                                              isOpen: !sortBy.isOpen,
                                            })
                                          }
                                          className="catalog__sort-by"
                                          isDisabled={!!searchString}
                                          isExpanded={sortBy.isOpen}
                                        >
                                          {`Sort by: ${searchString ? 'Search' : sortBy.selected === 'AZ' || sortBy.selected === 'ZA' ? `${sortBy.selected[0]}->${sortBy.selected[1]}` : sortBy.selected}`}
                                        </MenuToggle>
                                      )}
                                      onOpenChange={(isOpen) =>
                                        setSortBy({
                                          ...sortBy,
                                          isOpen,
                                        })
                                      }
                                      onSelect={(_, selection) =>
                                        setSortBy({
                                          ...sortBy,
                                          selected: selection as 'Featured' | 'Rating' | 'AZ' | 'ZA',
                                          isOpen: false,
                                        })
                                      }
                                      selected={sortBy.selected}
                                      isOpen={sortBy.isOpen}
                                    >
                                      <SelectList>
                                        <SelectOption key={0} value="Featured">
                                          Featured
                                        </SelectOption>
                                        <SelectOption key={1} value="Rating">
                                          Rating
                                        </SelectOption>
                                        <SelectOption key={2} value="AZ">
                                          A-&gt;Z
                                        </SelectOption>
                                        <SelectOption key={3} value="ZA">
                                          Z-&gt;A
                                        </SelectOption>
                                      </SelectList>
                                    </Select>
                                  </li>
                                </ul>
                              </StackItem>
                              <StackItem>
                                <Title headingLevel="h4" className="catalog__item-count">
                                  {catalogItemsResult.length} item{catalogItemsResult.length > 1 && 's'}
                                </Title>
                              </StackItem>
                            </Stack>
                          </SplitItem>
                        </Split>
                      </PageSection>
                      <CatalogContent
                        catalogItemsResult={catalogItemsResult}
                        onClearFilters={onClearFilters}
                        view={view}
                        userHasRequiredPropertiesToAccess={userHasRequiredPropertiesToAccess}
                      />
                    </SidebarContent>
                  </Sidebar>
                </CardBody>
              </Card>
            </PageSection>
            <Footer />
          </DrawerContentBody>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default Catalog;
