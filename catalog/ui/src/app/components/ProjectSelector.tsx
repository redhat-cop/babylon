import React, { useCallback, useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import { FixedSizeList as List } from 'react-window';
import useSession from '@app/utils/useSession';
import { ServiceNamespace } from '@app/types';
import { apiPaths, fetcher } from '@app/api';
import { namespaceToServiceNamespaceMapper } from '@app/util';
import LoadingIcon from './LoadingIcon';
import {
  Divider,
  Dropdown,
  DropdownItem,
  InputGroup,
  InputGroupItem,
  MenuSearch,
  MenuSearchInput,
  MenuToggle,
  SearchInput,
} from '@patternfly/react-core';

import './project-selector.css';

const ProjectSelector: React.FC<{
  currentNamespaceName?: string;
  onSelect: (namespace: ServiceNamespace) => void;
  isPlain?: boolean;
  selector?: 'users' | 'anarchy';
  hideLabel?: boolean;
}> = ({ currentNamespaceName, onSelect, isPlain = false, selector = 'users', hideLabel = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { cache } = useSWRConfig();
  const [allNamespaces, setAllNamespaces] = useState<ServiceNamespace[]>(null);
  const [searchValue, setSearchValue] = useState('');
  const menuRef = React.useRef<HTMLDivElement>(null);
  const { isAdmin, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const serviceNamespaces = useMemo(
    () => (isAdmin ? allNamespaces : sessionServiceNamespaces) ?? [],
    [isAdmin, allNamespaces, sessionServiceNamespaces],
  );

  const labelSelector =
    selector === 'users'
      ? 'usernamespace.gpte.redhat.com/user-uid'
      : selector === 'anarchy'
        ? 'app.kubernetes.io/name=anarchy'
        : null;

  const toggleOpen = useCallback(() => {
    if (isAdmin && allNamespaces === null) {
      const data = cache.get(apiPaths.NAMESPACES({ labelSelector })) as ServiceNamespace[];
      if (data && Array.isArray(data)) {
        setAllNamespaces(data);
      } else {
        fetcher(apiPaths.NAMESPACES({ labelSelector })).then((data) => {
          const namespaces = data.items.map(namespaceToServiceNamespaceMapper);
          setAllNamespaces(namespaces);
          cache.set(apiPaths.NAMESPACES({ labelSelector }), namespaces);
        });
      }
    }
    setIsOpen((v) => !v);
  }, [setIsOpen, setAllNamespaces, allNamespaces, isAdmin]);

  const filteredServiceNamespaces = useMemo(
    () =>
      serviceNamespaces.filter((ns) =>
        ns.name.toLowerCase().includes(searchValue.toLowerCase()) || ns.displayName
          ? ns.displayName.toLowerCase().includes(searchValue.toLowerCase())
          : false,
      ),
    [serviceNamespaces, searchValue],
  );

  const Row = ({ index, style }) => (
    <div style={style}>
      <DropdownItem
        itemId={filteredServiceNamespaces[index].name}
        key={filteredServiceNamespaces[index].name}
        onClick={() => {
          onSelect(filteredServiceNamespaces[index]);
          setIsOpen(false);
        }}
      >
        <span className="project-selector__item">
          {filteredServiceNamespaces[index].displayName || filteredServiceNamespaces[index].name}
        </span>
      </DropdownItem>
    </div>
  );

  return (
    <Dropdown
      className="project-selector"
      isOpen={isOpen}
      onOpenChangeKeys={['Escape']}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          onClick={toggleOpen}
          isExpanded={isOpen}
          variant={isPlain ? 'plainText' : 'default'}
        >
          {`${hideLabel ? '' : 'Project: '}${currentNamespaceName ?? 'All projects'}`}
        </MenuToggle>
      )}
      ref={menuRef}
      id="project-selector"
      isScrollable
    >
      <MenuSearch>
        <MenuSearchInput>
          <InputGroup>
            <InputGroupItem isFill>
              <SearchInput
                value={searchValue}
                placeholder={'Search'}
                onChange={(_event, value: string) => setSearchValue(value)}
                aria-labelledby="pf-v5-context-selector-search-button-id-1"
              />
            </InputGroupItem>
          </InputGroup>
        </MenuSearchInput>
      </MenuSearch>
      <Divider />
      {serviceNamespaces.length === 0 ? (
        <DropdownItem key="loading" onClick={null} className="project-selector__loading">
          <LoadingIcon />
        </DropdownItem>
      ) : (
        <List height={200} itemCount={filteredServiceNamespaces.length} itemSize={40} width={400}>
          {Row}
        </List>
      )}
    </Dropdown>
  );
};

export default ProjectSelector;
