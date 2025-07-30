import React, { useState } from 'react';
import { PageSection } from '@patternfly/react-core';
import { Dropdown, DropdownItem, DropdownList, MenuToggle, MenuToggleElement } from '@patternfly/react-core';
import useSession from '@app/utils/useSession';
import { displayName } from '@app/util';

const CatalogNamespaceSelect: React.FC<{
  onSelect: (ns: string) => void;
  selected?: string;
}> = ({ onSelect, selected }) => {
  const { catalogNamespaces } = useSession().getSession();
  const selectedCatalogNamespace = catalogNamespaces.find((ns) => ns.name === selected);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const onToggleClick = () => {
    setIsOpen(!isOpen);
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Dropdown
        isOpen={isOpen}
        onOpenChange={(isOpen: boolean) => setIsOpen(isOpen)}
        isScrollable
        toggle={(ns: React.Ref<MenuToggleElement>) => (
          <MenuToggle ref={ns} onClick={onToggleClick} isExpanded={isOpen}>
            Catalog: {selected ? displayName(selectedCatalogNamespace) : 'all catalogs'}
          </MenuToggle>
        )}
      >
        <DropdownList>
          <DropdownItem
            value="*"
            key="*"
            onClick={() => {
              setIsOpen(false);
              onSelect(null);
            }}
          >
            - all catalogs -
          </DropdownItem>
          {catalogNamespaces.map((ns) => (
            <DropdownItem
              value={ns.name}
              key={ns.name}
              onClick={() => {
                setIsOpen(false);
                onSelect(ns.name);
              }}
            >
              {displayName(ns)}
            </DropdownItem>
          ))}
        </DropdownList>
      </Dropdown>
    </PageSection>
  );
};

export default CatalogNamespaceSelect;
