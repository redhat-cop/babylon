import React, { useState, useMemo, useCallback } from 'react';
import Fuse from 'fuse.js';
import {
  Modal,
  Button,
  Grid,
  GridItem,
  SearchInput,
  EmptyState,
  EmptyStateBody,
  Title,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import useSWRInfinite from 'swr/infinite';
import useSWR from 'swr';
import { CatalogItem, CatalogItemList } from '@app/types';
import { apiPaths, fetcher, fetcherItemsInAllPages } from '@app/api';
import { compareK8sObjectsArr, displayName, FETCH_BATCH_LIMIT } from '@app/util';
import CatalogItemCard from '@app/Catalog/CatalogItemCard';
import useSession from '@app/utils/useSession';

interface CatalogItemSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (catalogItem: CatalogItem) => void;
  title?: string;
}

// Fetch catalog items from multiple namespaces
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

const CatalogItemSelectorModal: React.FC<CatalogItemSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  title = 'Select Catalog Item'
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [selectedCatalogNamespace, setSelectedCatalogNamespace] = useState<string | null>(null);
  const [isCatalogDropdownOpen, setIsCatalogDropdownOpen] = useState(false);
  const { catalogNamespaces } = useSession().getSession();
  const catalogNamespaceNames = catalogNamespaces.map((ns) => ns.name);

  const { data: catalogItemsArr } = useSWR<CatalogItem[]>(
    `catalog-items-${selectedCatalogNamespace || 'all-catalogs'}`,
    () => fetchCatalog(selectedCatalogNamespace ? [selectedCatalogNamespace] : catalogNamespaceNames),
  );

  const catalogItems: CatalogItem[] = useMemo(
    () => catalogItemsArr || [],
    [catalogItemsArr],
  );

  const [catalogItemsFuse, allowedCatalogItems] = useMemo(() => {
    // First filter out items with spec.parameters that have annotations other than allowed ones
    const allowedAnnotations = ['pfe.redhat.com/salesforce-id', 'demo.redhat.com/purpose'];
    
    const filteredItems = catalogItems.filter((item) => {
      const parameters = item.spec?.parameters || [];
      
      // Only allow items where ALL parameters have one of the allowed annotations
      const allParametersHaveAllowedAnnotations = parameters.every((param) => {
        const annotation = param.annotation;
        
        // Parameter must have an annotation AND it must be in the allowed list
        return annotation && allowedAnnotations.includes(annotation);
      });
      
      // Include items only if all parameters have allowed annotations
      return allParametersHaveAllowedAnnotations;
    });

    // Create Fuse search instance with the same options as Catalog.tsx
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
          weight: 8,
        },
        {
          name: ['spec', 'description'],
          weight: 6,
        },
        {
          name: ['spec', 'summary'],
          weight: 4,
        },
        {
          name: ['spec', 'keywords'],
          weight: 2,
        },
        {
          name: ['metadata', 'labels', 'babylon.gpte.redhat.com/Product_Family'],
          weight: 0.5,
        },
      ],
    };
    
    const fuse = new Fuse(filteredItems, options);
    return [fuse, filteredItems];
  }, [catalogItems]);

  const filteredCatalogItems = useMemo(() => {
    if (!searchValue.trim()) return allowedCatalogItems;
    
    // Use Fuse search with the same pattern as Catalog.tsx
    return catalogItemsFuse.search("'" + searchValue.split(' ').join(" '")).map((x) => x.item);
  }, [searchValue, catalogItemsFuse, allowedCatalogItems]);

  const handleItemSelect = useCallback((catalogItem: CatalogItem) => {
    onSelect(catalogItem);
    onClose();
  }, [onSelect, onClose]);

  const selectedCatalogNamespaceObj = catalogNamespaces.find((ns) => ns.name === selectedCatalogNamespace);



  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width="80%"
      height="70%"
      
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px', backgroundColor: 'var(--pf-t--global--background--color--200)', marginRight: 0, paddingRight: '64px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            <Dropdown
              isOpen={isCatalogDropdownOpen}
              onOpenChange={(isOpen: boolean) => setIsCatalogDropdownOpen(isOpen)}
              isScrollable
              toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                <MenuToggle ref={toggleRef} onClick={() => setIsCatalogDropdownOpen(!isCatalogDropdownOpen)} isExpanded={isCatalogDropdownOpen}>
                  Catalog: {selectedCatalogNamespace ? displayName(selectedCatalogNamespaceObj) : 'all catalogs'}
                </MenuToggle>
              )}
            >
              <DropdownList>
                <DropdownItem
                  value="*"
                  key="*"
                  onClick={() => {
                    setIsCatalogDropdownOpen(false);
                    setSelectedCatalogNamespace(null);
                  }}
                >
                  - all catalogs -
                </DropdownItem>
                {catalogNamespaces.map((ns) => (
                  <DropdownItem
                    value={ns.name}
                    key={ns.name}
                    onClick={() => {
                      setIsCatalogDropdownOpen(false);
                      setSelectedCatalogNamespace(ns.name);
                    }}
                  >
                    {displayName(ns)}
                  </DropdownItem>
                ))}
              </DropdownList>
            </Dropdown>
          </div>
          <div style={{ maxWidth: '400px' }}>
            <SearchInput
              placeholder="Search catalog items..."
              value={searchValue}
              onChange={(_, value) => setSearchValue(value)}
              onClear={() => setSearchValue('')}
            />
          </div>
        </div>
        
        <div 
          style={{ 
            flex: 1, 
            overflow: 'auto',
            border: '1px solid var(--pf-t--color--border--default)',
            borderRadius: '4px',
            padding: '16px'
          }}
        >
          {filteredCatalogItems.length === 0 ? (
            <EmptyState>
              <Title headingLevel="h4" size="lg">
                {searchValue ? 'No catalog items found' : 'No catalog items available'}
              </Title>
              <EmptyStateBody>
                {searchValue 
                  ? `No catalog items match "${searchValue}". Try adjusting your search terms.`
                  : 'There are no catalog items available at this time.'
                }
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <Grid hasGutter>
              {filteredCatalogItems.map((catalogItem) => (
                <GridItem key={`${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`} span={12} md={6} lg={3}>
                  <div style={{ height: '260px', width: '280px' }}>
                    <CatalogItemCard 
                      catalogItem={catalogItem} 
                      isSelectable={true}
                      onClick={handleItemSelect}
                    />
                  </div>
                </GridItem>
              ))}
            </Grid>
          )}
        </div>
        
        <div style={{ marginTop: '16px', textAlign: 'right' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CatalogItemSelectorModal;
