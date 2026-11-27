import React from 'react';
import useSWRImmutable from 'swr/immutable';
import { apiPaths, silentFetcher } from '@app/api';
import type { CatalogItem } from '@app/types';
import { displayName } from '@app/util';

/** Catalog item display name, falling back to the item name while loading or if it is gone. */
const CatalogItemName: React.FC<{ namespace: string; name: string }> = ({ namespace, name }) => {
  const { data } = useSWRImmutable<CatalogItem | null>(
    namespace && name ? apiPaths.CATALOG_ITEM({ namespace, name }) : null,
    silentFetcher,
    { suspense: false, shouldRetryOnError: false },
  );
  return <>{data ? displayName(data) : name}</>;
};

export default CatalogItemName;
