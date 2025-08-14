import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  Button,
  Card,
  CardBody,
  CardHeader,
  Grid,
  GridItem,
  SearchInput,
  EmptyState,
  EmptyStateBody,
  Title,
  Badge,
  Split,
  SplitItem,
  Tooltip,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import useSWRInfinite from 'swr/infinite';
import useSWRImmutable from 'swr/immutable';
import { CatalogItem, CatalogItemList } from '@app/types';
import { apiPaths, fetcher, fetcherItemsInAllPages } from '@app/api';
import { compareK8sObjectsArr, displayName, FETCH_BATCH_LIMIT } from '@app/util';
import CatalogItemIcon from '@app/Catalog/CatalogItemIcon';
import { getStage, getSLA } from '@app/Catalog/catalog-utils';
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

  const { data: catalogItemsArr } = useSWRImmutable<CatalogItem[]>(
    apiPaths.CATALOG_ITEMS({
      namespace: selectedCatalogNamespace ? selectedCatalogNamespace : 'all-catalogs',
    }),
    () => fetchCatalog(selectedCatalogNamespace ? [selectedCatalogNamespace] : catalogNamespaceNames),
  );

  const catalogItems: CatalogItem[] = useMemo(
    () => catalogItemsArr || [],
    [catalogItemsArr],
  );

  const filteredCatalogItems = useMemo(() => {
    // First filter out items with spec.parameters that have annotations other than allowed ones
    const allowedAnnotations = ['pfe.redhat.com/salesforce-id', 'demo.redhat.com/purpose'];
    
    const allowedCatalogItems = catalogItems.filter((item) => {
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

    // Then apply search filter
    if (!searchValue.trim()) return allowedCatalogItems;
    const searchLower = searchValue.toLowerCase();
    return allowedCatalogItems.filter((item) => {
      const name = displayName(item);
      return (
        name.toLowerCase().includes(searchLower) ||
        item.metadata.name.includes(searchLower)
      );
    });
  }, [catalogItems, searchValue]);

  const handleItemSelect = useCallback((catalogItem: CatalogItem) => {
    onSelect(catalogItem);
    onClose();
  }, [onSelect, onClose]);

  const selectedCatalogNamespaceObj = catalogNamespaces.find((ns) => ns.name === selectedCatalogNamespace);

  const CatalogItemCard: React.FC<{ catalogItem: CatalogItem }> = ({ catalogItem }) => {
    const stage = getStage(catalogItem);
    const sla = getSLA(catalogItem);
    
    return (
      <Card 
        isSelectable 
        onClick={() => handleItemSelect(catalogItem)}
        style={{ cursor: 'pointer', height: '100%' }}
      >
        <CardHeader>
          <Split hasGutter>
            <SplitItem>
              <CatalogItemIcon catalogItem={catalogItem} />
            </SplitItem>
            <SplitItem isFilled>
              <Title headingLevel="h4" size="md" style={{ lineHeight: '1.2' }}>
                {displayName(catalogItem)}
              </Title>
            </SplitItem>
            <SplitItem>
              {sla && stage === 'prod' ? (
                <Tooltip content="Service Level">
                  <Badge color="blue">{sla.replace(/_+/g, ' | ')}</Badge>
                </Tooltip>
              ) : stage === 'dev' ? (
                <Badge color="orange">development</Badge>
              ) : stage === 'test' ? (
                <Badge color="purple">test</Badge>
              ) : stage === 'event' ? (
                <Badge color="green">event</Badge>
              ) : null}
            </SplitItem>
          </Split>
        </CardHeader>
        <CardBody>
          <div style={{ 
            fontSize: '14px', 
            color: 'var(--pf-t--color--text--secondary)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical'
          }}>
            {'No description available'}
          </div>
          <div style={{ 
            marginTop: '8px', 
            fontSize: '13px', 
            color: 'var(--pf-t--color--text--secondary)',
            fontFamily: 'monospace'
          }}>
            {catalogItem.metadata.namespace}/{catalogItem.metadata.name}
          </div>
        </CardBody>
      </Card>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width="80%"
      height="70%"
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
          <SearchInput
            placeholder="Search catalog items..."
            value={searchValue}
            onChange={(_, value) => setSearchValue(value)}
            onClear={() => setSearchValue('')}
          />
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
                <GridItem key={`${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`} span={12} md={6} lg={4}>
                  <CatalogItemCard catalogItem={catalogItem} />
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
