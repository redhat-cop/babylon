import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import { FixedSizeList as List } from 'react-window';
import { ContextSelector, ContextSelectorItem } from '@patternfly/react-core';
import useSession from '@app/utils/useSession';
import { ServiceNamespace } from '@app/types';
import { apiPaths, fetcher } from '@app/api';
import { namespaceToServiceNamespaceMapper } from '@app/util';
import LoadingIcon from './LoadingIcon';

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
  const { isAdmin, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const [abortController] = useState(new AbortController());
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

  useEffect(() => {
    return () => abortController.abort();
  }, []);

  const toggleOpen = useCallback(() => {
    if (isAdmin && allNamespaces === null) {
      const data = cache.get(apiPaths.NAMESPACES({ labelSelector })) as ServiceNamespace[];
      if (data && Array.isArray(data)) {
        setAllNamespaces(data);
      } else {
        fetcher(apiPaths.NAMESPACES({ labelSelector })).then((data) => {
          if (abortController.signal.aborted) return null;
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
      <ContextSelectorItem
        key={filteredServiceNamespaces[index].name}
        onClick={() => {
          onSelect(filteredServiceNamespaces[index]);
          setIsOpen(false);
        }}
      >
        <span className="project-selector__item">
          {filteredServiceNamespaces[index].displayName || filteredServiceNamespaces[index].name}
        </span>
      </ContextSelectorItem>
    </div>
  );

  return (
    <ContextSelector
      className="project-selector"
      isOpen={isOpen}
      isPlain={isPlain}
      isText={true}
      onSearchInputChange={(value: string) => setSearchValue(value)}
      onToggle={toggleOpen}
      searchInputValue={searchValue}
      toggleText={`${hideLabel ? '' : 'Project: '}${currentNamespaceName ?? 'All projects'}`}
    >
      {serviceNamespaces.length === 0 ? (
        <ContextSelectorItem key="loading" onClick={null} className="project-selector__loading">
          <LoadingIcon />
        </ContextSelectorItem>
      ) : (
        <List height={200} itemCount={filteredServiceNamespaces.length} itemSize={40} width={400}>
          {Row}
        </List>
      )}
    </ContextSelector>
  );
};

export default ProjectSelector;
