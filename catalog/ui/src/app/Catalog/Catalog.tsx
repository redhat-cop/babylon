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
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Select,
  SelectOption,
  SelectVariant,
  Sidebar,
  SidebarContent,
  SidebarPanel,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import DownloadIcon from '@patternfly/react-icons/dist/js/icons/download-icon';
import ListIcon from '@patternfly/react-icons/dist/js/icons/list-icon';
import ThIcon from '@patternfly/react-icons/dist/js/icons/th-icon';
import useSWRImmutable from 'swr/immutable';
import { AsyncParser } from 'json2csv';
import { apiPaths, fetcherItemsInAllPages } from '@app/api';
import { CatalogItem } from '@app/types';
import useSession from '@app/utils/useSession';
import SearchInputString from '@app/components/SearchInputString';
import { checkAccessControl, displayName, BABYLON_DOMAIN, FETCH_BATCH_LIMIT, stripTags } from '@app/util';
import LoadingIcon from '@app/components/LoadingIcon';
import Footer from '@app/components/Footer';
import {
  formatString,
  getCategory,
  HIDDEN_ANNOTATIONS,
  HIDDEN_LABELS,
  CUSTOM_LABELS,
  setLastFilter,
} from './catalog-utils';
import CatalogCategorySelector from './CatalogCategorySelector';
import CatalogInterfaceDescription from './CatalogInterfaceDescription';
import CatalogItemDetails from './CatalogItemDetails';
import CatalogLabelSelector from './CatalogLabelSelector';
import CatalogNamespaceSelect from './CatalogNamespaceSelect';
import CatalogContent from './CatalogContent';

import './catalog.css';

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
        label.startsWith(BABYLON_DOMAIN + '/') &&
        !HIDDEN_LABELS.includes(label.substring(BABYLON_DOMAIN.length + 1))
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
      label: formatString(label.substring(BABYLON_DOMAIN.length + 1)),
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

function filterCatalogItemByAccessControl(catalogItem: CatalogItem, userGroups: string[]) {
  return 'deny' !== checkAccessControl(catalogItem.spec.accessControl, userGroups);
}

function filterCatalogItemByCategory(catalogItem: CatalogItem, selectedCategory: string) {
  return selectedCategory === getCategory(catalogItem);
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
          if (ciAttr === CUSTOM_LABELS.RATING) {
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

function saveFilter(urlParmsString: string, catalogNamespaceName: string) {
  const urlParams = new URLSearchParams(urlParmsString);
  if (urlParams.has('item')) {
    urlParams.delete('item');
  }
  if (urlParams.has('catalog')) {
    urlParams.delete('catalog');
  }
  catalogNamespaceName && urlParams.append('catalog', catalogNamespaceName);
  setLastFilter(urlParams.toString());
}

async function fetchCatalog(namespaces: string[]): Promise<CatalogItem[]> {
  async function fetchNamespace(namespace: string): Promise<CatalogItem[]> {
    return await fetcherItemsInAllPages((continueId) =>
      apiPaths.CATALOG_ITEMS({ namespace, limit: FETCH_BATCH_LIMIT, continueId })
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
  const selectedCategory = searchParams.has('category') ? searchParams.get('category') : null;
  const labelsString = searchParams.has('labels') ? searchParams.get('labels') : null;
  const selectedLabels: { [label: string]: string[] } = useMemo(
    () => (labelsString ? JSON.parse(labelsString) : {}),
    [labelsString]
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
          const aRating =
            a.metadata.labels[`${BABYLON_DOMAIN}/${sortBy.selected === 'Featured' ? 'Featured_Score' : 'rating'}`];
          const bRating =
            b.metadata.labels[`${BABYLON_DOMAIN}/${sortBy.selected === 'Featured' ? 'Featured_Score' : 'rating'}`];
          if (aRating || bRating) {
            if (aRating && bRating) return parseInt(aRating, 10) < parseInt(bRating, 10) ? 1 : -1;
            if (bRating) return 1;
            return -1;
          }
          return aDisplayName < bDisplayName ? -1 : 1;
        }
      }
      const aStage = a.metadata.labels?.[`${BABYLON_DOMAIN}/stage`];
      const bStage = b.metadata.labels?.[`${BABYLON_DOMAIN}/stage`];
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
    [sortBy.selected]
  );

  const { data: catalogItemsArr } = useSWRImmutable<CatalogItem[]>(
    apiPaths.CATALOG_ITEMS({ namespace: catalogNamespaceName ? catalogNamespaceName : 'all-catalogs' }),
    () => fetchCatalog(catalogNamespaceName ? [catalogNamespaceName] : catalogNamespaceNames)
  );

  const catalogItems = useMemo(
    () => catalogItemsArr.filter((ci) => filterCatalogItemByAccessControl(ci, groups)),
    [catalogItemsArr, groups]
  );

  // Filter & Sort catalog items
  const [_catalogItems, _catalogItemsCpy] = useMemo(() => {
    const catalogItemsCpy = [...catalogItems].sort(compareCatalogItems);
    catalogItemsCpy.forEach((c, i) => {
      if (c.metadata.annotations) {
        catalogItemsCpy[i].metadata.annotations['babylon.gpte.redhat.com/safe_description'] = stripTags(
          c.metadata.annotations['babylon.gpte.redhat.com/description']
        );
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
          name: ['metadata', 'annotations', 'babylon.gpte.redhat.com/displayName'],
          weight: 10,
        },
        {
          name: ['metadata', 'name'],
          weight: 10,
        },
        {
          name: ['metadata', 'annotations', 'babylon.gpte.redhat.com/keywords'],
          weight: 5,
        },
        {
          name: ['metadata', 'labels', 'babylon.gpte.redhat.com/Sales_Play'],
          weight: 3,
        },
        {
          name: ['metadata', 'annotations', 'babylon.gpte.redhat.com/safe_description'],
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
    if (selectedCategory) {
      catalogItemsFuse.remove((ci) => !filterCatalogItemByCategory(ci, selectedCategory));
    }
    if (selectedLabels) {
      catalogItemsFuse.remove((ci) => !filterCatalogItemByLabels(ci, selectedLabels));
    }
    return [catalogItemsFuse, catalogItemsCpy];
  }, [catalogItems, selectedCategory, selectedLabels, compareCatalogItems]);

  const catalogItemsResult = useMemo(
    () =>
      searchString
        ? _catalogItems.search("'" + searchString.split(' ').join(" '")).map((x) => x.item)
        : _catalogItemsCpy,
    [searchString, _catalogItems, _catalogItemsCpy]
  );

  const openCatalogItem =
    openCatalogItemName && openCatalogItemNamespaceName
      ? catalogItems.find(
          (item) =>
            item.metadata.name === openCatalogItemName && item.metadata.namespace === openCatalogItemNamespaceName
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
    saveFilter(searchParams.toString(), catalogNamespaceName);
    setSearchParams(searchParams);
  }

  function onSelectCatalogNamespace(namespaceName: string) {
    saveFilter(searchParams.toString(), namespaceName);
    if (namespaceName) {
      navigate(`/catalog/${namespaceName}${location.search}`);
    } else {
      navigate(`/catalog${location.search}`);
    }
  }

  function onSelectCategory(category: string) {
    if (category) {
      searchParams.set('category', category);
    } else if (searchParams.has('category')) {
      searchParams.delete('category');
    }
    saveFilter(searchParams.toString(), catalogNamespaceName);
    setSearchParams(searchParams);
  }

  function onSelectLabels(labels: { [label: string]: string[] }) {
    if (labels) {
      searchParams.set('labels', JSON.stringify(labels));
    } else if (searchParams.has('labels')) {
      searchParams.delete('labels');
    }
    saveFilter(searchParams.toString(), catalogNamespaceName);
    setSearchParams(searchParams);
  }

  function onClearFilters() {
    saveFilter('', catalogNamespaceName);
    setSearchParams();
    searchInputStringCb && searchInputStringCb('');
  }

  return (
    <Drawer isExpanded={openCatalogItem ? true : false}>
      <DrawerContent
        panelContent={
          openCatalogItem ? (
            <Suspense
              fallback={
                <DrawerPanelContent widths={{ default: 'width_75', lg: 'width_75', xl: 'width_66', '2xl': 'width_50' }}>
                  <PageSection variant={PageSectionVariants.light}>
                    <EmptyState variant="full">
                      <EmptyStateIcon icon={LoadingIcon} />
                    </EmptyState>
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
          <PageSection className="catalog__body" variant={PageSectionVariants.light}>
            <Card>
              <CardBody>
                <Sidebar tabIndex={0}>
                  <SidebarPanel className="catalog__sidebar-panel">
                    <CatalogCategorySelector
                      catalogItems={catalogItems}
                      onSelect={onSelectCategory}
                      selected={selectedCategory}
                    />
                    <CatalogLabelSelector
                      catalogItems={catalogItems}
                      filteredCatalogItems={catalogItemsResult}
                      onSelect={onSelectLabels}
                      selected={selectedLabels}
                    />
                  </SidebarPanel>
                  <SidebarContent>
                    <PageSection variant={PageSectionVariants.light} className="catalog__header">
                      <Split>
                        <SplitItem isFilled>
                          <Title headingLevel="h2">
                            {selectedCategory ? formatString(selectedCategory) : 'All Items'}
                          </Title>
                          <SearchInputString
                            initialValue={searchString}
                            placeholder="Search"
                            onSearch={onSearchChange}
                            className="catalog__searchbox"
                            setValueCb={assignSearchInputStringCb}
                          />
                        </SplitItem>
                        <SplitItem>
                          <Stack hasGutter>
                            <StackItem>
                              <ul className="catalog__right-tools">
                                <li>
                                  <Tooltip content="Gallery view">
                                    <Button
                                      variant="plain"
                                      aria-label="View as gallery"
                                      onClick={() => setView('gallery')}
                                      isActive={view === 'gallery'}
                                    >
                                      <ThIcon />
                                    </Button>
                                  </Tooltip>
                                </li>
                                <li>
                                  <Tooltip content="List view">
                                    <Button
                                      variant="plain"
                                      aria-label="View as list"
                                      onClick={() => setView('list')}
                                      isActive={view === 'list'}
                                    >
                                      <ListIcon />
                                    </Button>
                                  </Tooltip>
                                </li>
                                {isAdmin ? (
                                  <li>
                                    <Tooltip content="Export to CSV">
                                      <Button
                                        variant="plain"
                                        aria-label="Export to CSV"
                                        onClick={() => handleExportCsv(catalogItems)}
                                      >
                                        <DownloadIcon />
                                      </Button>
                                    </Tooltip>
                                  </li>
                                ) : null}
                                <li>
                                  <Select
                                    className="catalog__sort-by"
                                    variant={SelectVariant.single}
                                    aria-label="Sort by"
                                    onToggle={(isOpen) =>
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
                                    selections={`Sort by: ${!!searchString ? 'Search' : sortBy.selected}`}
                                    isOpen={sortBy.isOpen}
                                    isDisabled={!!searchString}
                                  >
                                    <SelectOption key={0} value="Featured" />
                                    <SelectOption key={1} value="Rating" />
                                    <SelectOption key={2} value="AZ" />
                                    <SelectOption key={3} value="ZA" />
                                  </Select>
                                </li>
                              </ul>
                            </StackItem>
                            <StackItem>
                              <p className="catalog__item-count">
                                {catalogItemsResult.length} item{catalogItemsResult.length > 1 && 's'}
                              </p>
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
  );
};

export default Catalog;
