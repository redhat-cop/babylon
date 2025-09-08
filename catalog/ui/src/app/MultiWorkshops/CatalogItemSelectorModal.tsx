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
  Checkbox,
  Split,
  SplitItem,
  CardBody,
  CardHeader,
  Badge,
  Tooltip,
} from '@patternfly/react-core';
import LoadingSection from '@app/components/LoadingSection';
import useSWR from 'swr';
import useSWRImmutable from 'swr/immutable';
import { CatalogItem, Bookmark, BookmarkList } from '@app/types';
import { apiPaths, fetcherItemsInAllPages, fetcher } from '@app/api';
import { displayName, FETCH_BATCH_LIMIT, renderContent, stripHtml } from '@app/util';
import CatalogItemCard from '@app/Catalog/CatalogItemCard';
import CatalogItemIcon from '@app/Catalog/CatalogItemIcon';
import CatalogCategorySelector from '@app/Catalog/CatalogCategorySelector';
import { getCategory, getDescription, getProvider, getRating, getStage, getStatusFromCatalogItem, getSLA, formatString } from '@app/Catalog/catalog-utils';
import StarRating from '@app/components/StarRating';
import StatusPageIcons from '@app/components/StatusPageIcons';
import useSession from '@app/utils/useSession';

// Import the catalog item card styles
import '@app/Catalog/catalog-item-card.css';

// Constants for react-window grid
const GUTTER_SIZE = 16;
const GRID_COLUMN_WIDTH = 280;
const GRID_ROW_HEIGHT = 260;

// Selectable Catalog Item Card Component for multi-select mode
const SelectableCatalogItemCard: React.FC<{
  catalogItem: CatalogItem;
  isSelected: boolean;
  onToggle: (catalogItem: CatalogItem, isSelected: boolean) => void;
  onClick?: (catalogItem: CatalogItem) => void;
  isMultiSelectMode: boolean;
}> = ({ catalogItem, isSelected, onToggle, onClick, isMultiSelectMode }) => {
  const { description, descriptionFormat } = getDescription(catalogItem);
  const provider = getProvider(catalogItem);
  const stage = getStage(catalogItem);
  const rating = getRating(catalogItem);
  const status = getStatusFromCatalogItem(catalogItem);
  const sla = getSLA(catalogItem);

  const handleCardClick = (e: React.MouseEvent) => {
    if (isMultiSelectMode) {
      // In multi-select mode, clicking the card toggles selection
      e.preventDefault();
      onToggle(catalogItem, !isSelected);
    } else {
      // In single-select mode, clicking selects the item
      if (onClick) {
        onClick(catalogItem);
      }
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    onToggle(catalogItem, checked);
  };

  return (
    <div className="catalog-item-card__wrapper">
      <div className="catalog-item-card__badge">
        {sla && stage === 'prod' ? (
          <Tooltip content={<p>Service Level</p>}>
            <a href="/support" target="_blank" rel="nofollow noreferrer">
              <Badge className="catalog-item-card__badge--sla">{sla.replace(/_+/g, ' | ')}</Badge>
            </a>
          </Tooltip>
        ) : stage === 'dev' ? (
          <Badge className="catalog-item-card__badge--dev">development</Badge>
        ) : stage === 'test' ? (
          <Badge className="catalog-item-card__badge--test">test</Badge>
        ) : stage === 'event' ? (
          <Badge className="catalog-item-card__badge--event">event</Badge>
        ) : null}
      </div>
      
      <div
        className={`catalog-item-card ${status && status.disabled ? 'catalog-item-card--disabled' : ''} ${
          isSelected ? 'catalog-item-card--selected' : ''
        }`}
        onClick={handleCardClick}
        style={{ 
          cursor: 'pointer',
          border: isSelected ? '2px solid var(--pf-t--global--color--brand--default)' : undefined,
          position: 'relative'
        }}
      >
        {isMultiSelectMode && (
          <div style={{ 
            position: 'absolute', 
            top: '8px', 
            right: '8px', 
            zIndex: 1,
            backgroundColor: 'white',
            borderRadius: '4px',
            padding: '2px'
          }}>
            <Checkbox
              id={`checkbox-${catalogItem.metadata.namespace}-${catalogItem.metadata.name}`}
              isChecked={isSelected}
              onChange={(_, checked) => handleCheckboxChange(checked)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        
        <CardHeader className="catalog-item-card__header">
          <Split>
            <SplitItem>
              <CatalogItemIcon catalogItem={catalogItem} />
              {status && status.name !== 'Operational' ? (
                <StatusPageIcons status={status.name} className="catalog-item-card__statusPageIcon" />
              ) : null}
            </SplitItem>
          </Split>
        </CardHeader>
        <CardBody className="catalog-item-card__body">
          <Title className="catalog-item-card__title" headingLevel="h3">
            {displayName(catalogItem)}
          </Title>
          <Title className="catalog-item-card__subtitle" headingLevel="h6">
            provided by {formatString(provider)}
          </Title>
          {description ? (
            <div className="catalog-item-card__description">
              {stripHtml(renderContent(description, { format: descriptionFormat })).slice(0, 150)}
            </div>
          ) : null}
          <div className="catalog-item-card__rating">
            <StarRating count={5} rating={rating?.ratingScore} total={rating?.totalRatings} readOnly hideIfNotRated />
          </div>
        </CardBody>
      </div>
    </div>
  );
};

// Helper function to filter favorites, same as in Catalog.tsx
function filterFavorites(catalogItem: CatalogItem, favList: Bookmark[] = []) {
  return favList.some((f) => f.asset_uuid === catalogItem.metadata?.labels?.['gpte.redhat.com/asset-uuid']);
}

interface CatalogItemSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (catalogItem: CatalogItem | CatalogItem[]) => void;
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
  isMultiSelectMode: boolean;
  selectedItems: Map<string, CatalogItem>;
  onToggleItem: (catalogItem: CatalogItem, isSelected: boolean) => void;
}> = ({ searchValue, selectedCatalogNamespace, selectedCategory, onItemSelect, isMultiSelectMode, selectedItems, onToggleItem }) => {
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
      
      // Filter for catalog items with demo.redhat.com/assetGroup = ZEROTOUCH
      const assetGroupLabel = item.metadata?.labels?.['demo.redhat.com/assetGroup'];
      const hasZerotouchAssetGroup = assetGroupLabel === 'ZEROTOUCH';
      
      // Include items only if all parameters have allowed annotations AND has ZEROTOUCH asset group
      return allParametersHaveAllowedAnnotations && hasZerotouchAssetGroup;
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

      const itemKey = `${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`;
      const isSelected = selectedItems.has(itemKey);

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
          <SelectableCatalogItemCard
            catalogItem={catalogItem}
            isSelected={isSelected}
            onToggle={onToggleItem}
            onClick={onItemSelect}
            isMultiSelectMode={isMultiSelectMode}
          />
        </div>
      );
    },
    [catalogItemsGrid, onItemSelect, isMultiSelectMode, selectedItems, onToggleItem],
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
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Map<string, CatalogItem>>(new Map());
  const { catalogNamespaces } = useSession().getSession();

  const handleItemSelect = useCallback((catalogItem: CatalogItem) => {
    if (!isMultiSelectMode) {
      onSelect(catalogItem);
      onClose();
    }
  }, [onSelect, onClose, isMultiSelectMode]);

  const handleToggleItem = useCallback((catalogItem: CatalogItem, isSelected: boolean) => {
    const itemKey = `${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`;
    setSelectedItems(prev => {
      const newMap = new Map(prev);
      if (isSelected) {
        newMap.set(itemKey, catalogItem);
      } else {
        newMap.delete(itemKey);
      }
      return newMap;
    });
  }, []);

  const handleMultiSelectSubmit = useCallback(() => {
    if (selectedItems.size > 0) {
      const catalogItems = Array.from(selectedItems.values());
      onSelect(catalogItems);
      setSelectedItems(new Map());
      onClose();
    }
  }, [selectedItems, onSelect, onClose]);

  const handleClose = useCallback(() => {
    setSelectedItems(new Map());
    setIsMultiSelectMode(false);
    onClose();
  }, [onClose]);

  const handleMultiSelectToggle = useCallback((checked: boolean) => {
    setIsMultiSelectMode(checked);
    if (!checked) {
      setSelectedItems(new Map());
    }
  }, []);

  const selectedCatalogNamespaceObj = catalogNamespaces.find((ns) => ns.name === selectedCatalogNamespace);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      width="80%"
      height="80%"
      
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px', backgroundColor: 'var(--pf-t--global--background--color--200)', marginRight: 0, paddingRight: '64px' }}>
        {/* Header with multi-select toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox
              id="multi-select-toggle"
              label="Multi-Select"
              isChecked={isMultiSelectMode}
              onChange={(_, checked) => handleMultiSelectToggle(checked)}
            />
          </div>
        </div>
        
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
                isMultiSelectMode={isMultiSelectMode}
                selectedItems={selectedItems}
                onToggleItem={handleToggleItem}
              />
            </Suspense>
          ) : null}
        </div>
        
        <div style={{ marginTop: '16px', textAlign: 'right' }}>
          <Split hasGutter>
            <SplitItem isFilled />
            {isMultiSelectMode && (
              <SplitItem>
                <span style={{ marginRight: '16px', fontSize: '14px', color: 'var(--pf-t--global--text--color--subtle)' }}>
                  {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                </span>
              </SplitItem>
            )}
            <SplitItem>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
            </SplitItem>
            {isMultiSelectMode && (
              <SplitItem>
                <Button 
                  variant="primary" 
                  onClick={handleMultiSelectSubmit}
                  isDisabled={selectedItems.size === 0}
                >
                  Add Selected ({selectedItems.size})
                </Button>
              </SplitItem>
            )}
          </Split>
        </div>
      </div>
    </Modal>
  );
};

export default CatalogItemSelectorModal;
