import React, { useState, useMemo, useCallback, Suspense, useRef, useEffect } from 'react';
import Fuse from 'fuse.js';
import { FixedSizeGrid as Grid } from 'react-window';
import {
  Modal,
  Button,
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
import LoadingSection from '@app/components/LoadingSection';
import useSWR from 'swr';
import useSWRImmutable from 'swr/immutable';
import { CatalogItem, Bookmark, BookmarkList } from '@app/types';
import { apiPaths, fetcherItemsInAllPages, fetcher } from '@app/api';
import { displayName, FETCH_BATCH_LIMIT } from '@app/util';
import CatalogItemCard from '@app/Catalog/CatalogItemCard';
import CatalogCategorySelector from '@app/Catalog/CatalogCategorySelector';
import { getCategory } from '@app/Catalog/catalog-utils';
import useSession from '@app/utils/useSession';

// Constants for react-window grid
const GUTTER_SIZE = 16;
const GRID_COLUMN_WIDTH = 280;
const GRID_ROW_HEIGHT = 260;

// Helper function to filter favorites, same as in Catalog.tsx
function filterFavorites(catalogItem: CatalogItem, favList: Bookmark[] = []) {
  return favList.some((f) => f.asset_uuid === catalogItem.metadata?.labels?.['gpte.redhat.com/asset-uuid']);
}

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

// Component that fetches catalog items for category selector
const CategorySelectorContent: React.FC<{
  selectedCatalogNamespace: string | null;
  onSelect: (category: string) => void;
  selected: string | null;
}> = ({ selectedCatalogNamespace, onSelect, selected }) => {
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

  return (
    <div style={{ overflowX: 'auto' }}>
      <CatalogCategorySelector
        catalogItems={catalogItems}
        onSelect={onSelect}
        selected={selected}
        isVertical={false}
      />
    </div>
  );
};

// Component that fetches catalog items and will be wrapped in Suspense
const CatalogItemsContent: React.FC<{
  searchValue: string;
  selectedCatalogNamespace: string | null;
  selectedCategory: string | null;
  onItemSelect: (catalogItem: CatalogItem) => void;
}> = ({ searchValue, selectedCatalogNamespace, selectedCategory, onItemSelect }) => {
  const { catalogNamespaces } = useSession().getSession();
  const catalogNamespaceNames = catalogNamespaces.map((ns) => ns.name);

  const { data: catalogItemsArr } = useSWR<CatalogItem[]>(
    `catalog-items-${selectedCatalogNamespace || 'all-catalogs'}`,
    () => fetchCatalog(selectedCatalogNamespace ? [selectedCatalogNamespace] : catalogNamespaceNames),
  );

  // Fetch bookmarks for favorites functionality
  const { data: assetsFavList } = useSWRImmutable<BookmarkList>(
    apiPaths.FAVORITES({}), 
    fetcher, 
    {
      suspense: false,
      shouldRetryOnError: false,
    }
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
    let items = allowedCatalogItems;
    
    // Apply category filter first
    if (selectedCategory) {
      items = items.filter((catalogItem) => {
        if (selectedCategory === 'favorites' && assetsFavList?.bookmarks) {
          return filterFavorites(catalogItem, assetsFavList.bookmarks);
        } else if (selectedCategory === 'favorites') {
          // If no bookmarks data yet, show empty list
          return false;
        } else {
          return getCategory(catalogItem) === selectedCategory;
        }
      });
    }
    
    // Then apply search filter
    if (!searchValue.trim()) return items;
    
    // Create a new Fuse instance with the category-filtered items
    const searchFuse = new Fuse(items, {
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
    });
    
    return searchFuse.search("'" + searchValue.split(' ').join(" '")).map((x) => x.item);
  }, [searchValue, selectedCategory, catalogItemsFuse, allowedCatalogItems, assetsFavList]);

  // Ref for measuring container dimensions
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });

  // Measure container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setContainerDimensions({
          width: rect.width,
          height: rect.height,
        });
      }
    };

    if (containerRef.current) {
      updateDimensions();
    }
    
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Calculate grid dimensions for react-window
  const columnCount = Math.max(1, Math.floor(containerDimensions.width / (GRID_COLUMN_WIDTH + GUTTER_SIZE)));
  
  // Convert flat array to grid structure
  const catalogItemsGrid = useMemo(() => {
    const grid = [];
    for (let i = 0; i < filteredCatalogItems.length; i += columnCount) {
      grid.push(filteredCatalogItems.slice(i, i + columnCount));
    }
    return grid;
  }, [filteredCatalogItems, columnCount]);

  const Cell = useCallback(
    ({ columnIndex, rowIndex, style }) => {
      const catalogItem = catalogItemsGrid[rowIndex]?.[columnIndex];
      if (!catalogItem) return null;

      return (
        <div
          style={{
            ...style,
            left: style.left + GUTTER_SIZE,
            top: style.top + GUTTER_SIZE,
            width: style.width - GUTTER_SIZE,
            height: style.height - GUTTER_SIZE,
          }}
        >
          <CatalogItemCard 
            catalogItem={catalogItem} 
            isSelectable={true}
            onClick={onItemSelect}
          />
        </div>
      );
    },
    [catalogItemsGrid, onItemSelect],
  );

  return (
    <>
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
        <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
          <Grid
            columnCount={columnCount}
            columnWidth={GRID_COLUMN_WIDTH + GUTTER_SIZE}
            rowCount={catalogItemsGrid.length}
            rowHeight={GRID_ROW_HEIGHT + GUTTER_SIZE}
            width={containerDimensions.width}
            height={containerDimensions.height}
          >
            {Cell}
          </Grid>
        </div>
      )}
    </>
  );
};

const CatalogItemSelectorModal: React.FC<CatalogItemSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  title = 'Select Catalog Item'
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [selectedCatalogNamespace, setSelectedCatalogNamespace] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCatalogDropdownOpen, setIsCatalogDropdownOpen] = useState(false);
  const { catalogNamespaces } = useSession().getSession();

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
      height="80%"
      
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
        
        <div style={{ marginBottom: '16px' }}>
          {isOpen ? (
            <Suspense fallback={null}>
              <CategorySelectorContent
                selectedCatalogNamespace={selectedCatalogNamespace}
                onSelect={setSelectedCategory}
                selected={selectedCategory}
              />
            </Suspense>
          ) : null}
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
          {isOpen ? (
            <Suspense fallback={<LoadingSection />}>
              <CatalogItemsContent
                searchValue={searchValue}
                selectedCatalogNamespace={selectedCatalogNamespace}
                selectedCategory={selectedCategory}
                onItemSelect={handleItemSelect}
              />
            </Suspense>
          ) : null}
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
