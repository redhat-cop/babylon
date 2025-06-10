import React, { useState } from 'react';
import { PageSection, PageSectionVariants } from '@patternfly/react-core';
import { Dropdown, DropdownItem, DropdownList, MenuToggle, MenuToggleElement } from '@patternfly/react-core';
import useSession from '@app/utils/useSession';
import { displayName } from '@app/util';

import './catalog-namespace-select.css';

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
    <PageSection variant={PageSectionVariants.light} className="catalog-namespace-select">
      <Dropdown
        isPlain
        isOpen={isOpen}
        toggle={(ns: React.Ref<MenuToggleElement>) => (
          <MenuToggle ref={ns} isFullWidth onClick={onToggleClick} isExpanded={isOpen}>
            Catalog: {selected ? displayName(selectedCatalogNamespace) : 'all catalogs'}
          </MenuToggle>
        )}
      >
        <DropdownList>
          <DropdownItem
            value={0}
            key="*"
            onClick={() => {
              setIsOpen(false);
              onSelect(null);
            }}
          >
            - all catalogs -
          </DropdownItem>
          {...catalogNamespaces.map((ns) => (
            <DropdownItem
              value={1}
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
