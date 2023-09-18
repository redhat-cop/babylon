import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { PageSection, PageSectionVariants, Split, SplitItem, Title } from '@patternfly/react-core';
import { apiPaths, fetcherItemsInAllPages } from '@app/api';
import { CatalogItem } from '@app/types';
import useSWRImmutable from 'swr/immutable';
import useSession from '@app/utils/useSession';
import Fuse from 'fuse.js';
import { Link, useSearchParams } from 'react-router-dom';
import { displayName, FETCH_BATCH_LIMIT, stripTags } from '@app/util';
import SearchInputString from '@app/components/SearchInputString';
import { CUSTOM_LABELS } from '@app/Catalog/catalog-utils';
import { Table, TableBody, TableHeader } from '@patternfly/react-table';

import './admin.css';

async function fetchCatalog(namespaces: string[]): Promise<CatalogItem[]> {
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

const RatingsList: React.FC = () => {
  const { catalogNamespaces } = useSession().getSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const catalogNamespaceNames = catalogNamespaces.map((ci) => ci.name);
  const searchString = searchParams.has('search') ? searchParams.get('search').trim() : null;
  const { data: catalogItems } = useSWRImmutable<CatalogItem[]>(
    apiPaths.CATALOG_ITEMS({ namespace: 'all-catalogs' }),
    () => fetchCatalog(catalogNamespaceNames),
  );
  const [searchInputStringCb, setSearchInputStringCb] = useState<(val: string) => void>(null);
  const assignSearchInputStringCb = (cb: (v: string) => void) => setSearchInputStringCb(cb);

  // sync input with search param
  useLayoutEffect(() => {
    if (searchString && searchInputStringCb) {
      searchInputStringCb(searchString);
    }
  }, [searchString, searchInputStringCb]);

  const compareCatalogItems = useCallback((a: CatalogItem, b: CatalogItem): number => {
    const aDisplayName = displayName(a);
    const bDisplayName = displayName(b);
    if (aDisplayName !== bDisplayName) {
      // sortBy === 'Featured' and 'Rating'
      const selector = `${CUSTOM_LABELS.RATING.domain}/${CUSTOM_LABELS.RATING.key}`;
      const aRating = a.metadata.labels?.[selector];
      const bRating = b.metadata.labels?.[selector];
      if (aRating || bRating) {
        if (aRating && bRating) return parseInt(aRating, 10) < parseInt(bRating, 10) ? 1 : -1;
        if (bRating) return 1;
        return -1;
      }
      return aDisplayName < bDisplayName ? -1 : 1;
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
  }, []);

  // Filter & Sort catalog items
  const [_catalogItems, _catalogItemsCpy] = useMemo(() => {
    const catalogItemsCpy = [...catalogItems].sort(compareCatalogItems);
    catalogItemsCpy.forEach((c, i) => {
      if (c.metadata.annotations) {
        catalogItemsCpy[i].metadata.annotations['babylon.gpte.redhat.com/safe_description'] = stripTags(
          c.metadata.annotations['babylon.gpte.redhat.com/description'],
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
    return [catalogItemsFuse, catalogItemsCpy];
  }, [catalogItems]);

  const catalogItemsResult = useMemo(
    () =>
      searchString
        ? _catalogItems.search("'" + searchString.split(' ').join(" '")).map((x) => x.item)
        : _catalogItemsCpy,
    [searchString, _catalogItems, _catalogItemsCpy],
  );
  function onSearchChange(value: string) {
    if (value) {
      searchParams.set('search', value);
    } else if (searchParams.has('search')) {
      searchParams.delete('search');
    }
    setSearchParams(searchParams);
  }

  return (
    <div className="admin-container">
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Ratings
            </Title>
          </SplitItem>
          <SplitItem>
            <SearchInputString
              initialValue={searchString}
              placeholder="Search"
              onSearch={onSearchChange}
              className="catalog__searchbox"
              setValueCb={assignSearchInputStringCb}
            />
          </SplitItem>
        </Split>
      </PageSection>

      {catalogItemsResult.length > 0 ? (
        <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
          <Table
            aria-label="Table"
            variant="compact"
            cells={['Name', 'Catalog', 'Rating']}
            rows={catalogItemsResult.map((ci) => {
              const cells: any[] = [];
              cells.push(
                // Name
                <>{ci.metadata.name}</>,
                // Project
                <>{ci.metadata.namespace}</>,
                <>{ci.metadata.labels?.[`${CUSTOM_LABELS.RATING.domain}/${CUSTOM_LABELS.RATING.key}`] || '-'}</>,
              );
              return {
                cells: cells,
              };
            })}
          >
            <TableHeader />
            <TableBody />
          </Table>
        </PageSection>
      ) : null}
    </div>
  );
};

export default RatingsList;
