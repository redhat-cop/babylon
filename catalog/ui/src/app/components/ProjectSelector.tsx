import React, { useCallback, useMemo, useState } from 'react';
import useSession from '@app/utils/useSession';
import { ContextSelector, ContextSelectorItem } from '@patternfly/react-core';
import { ServiceNamespace } from '@app/types';
import { apiPaths, fetcher } from '@app/api';
import { namespaceToServiceNamespaceMapper } from '@app/util';
import LoadingIcon from './LoadingIcon';

import './project-selector.css';

const ProjectSelector: React.FC<{
  currentNamespaceName: string;
  onSelect: (namespace: ServiceNamespace) => void;
  isPlain?: boolean;
}> = ({ currentNamespaceName, onSelect, isPlain = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [allNamespaces, setAllNamespaces] = useState<ServiceNamespace[]>(null);
  const [searchValue, setSearchValue] = React.useState('');
  const { isAdmin, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const serviceNamespaces = useMemo(
    () => (isAdmin ? allNamespaces ?? [] : sessionServiceNamespaces),
    [isAdmin, allNamespaces, sessionServiceNamespaces]
  );

  const toggleOpen = useCallback(() => {
    if (isAdmin && allNamespaces === null) {
      fetcher(apiPaths.NAMESPACES({ labelSelector: 'usernamespace.gpte.redhat.com/user-uid' })).then((data) =>
        setAllNamespaces(data.items.map(namespaceToServiceNamespaceMapper))
      );
    }
    setIsOpen((v) => !v);
  }, [setIsOpen, setAllNamespaces, allNamespaces, isAdmin]);

  const filterFn = (ns: ServiceNamespace) =>
    ns.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    ns.displayName.toLowerCase().includes(searchValue.toLowerCase());

  return (
    <ContextSelector
      className="project-selector"
      isOpen={isOpen}
      isPlain={isPlain}
      isText={true}
      onSearchInputChange={(value: string) => setSearchValue(value)}
      onToggle={toggleOpen}
      searchInputValue={searchValue}
      toggleText={`Project: ${currentNamespaceName}`}
    >
      {serviceNamespaces.length === 0 ? (
        <ContextSelectorItem key="loading" onClick={null} className="project-selector__loading">
          <LoadingIcon />
        </ContextSelectorItem>
      ) : (
        serviceNamespaces.filter(filterFn).map((ns) => (
          <ContextSelectorItem
            key={ns.name}
            onClick={() => {
              onSelect(ns);
              setIsOpen(false);
            }}
          >
            {ns.displayName || ns.name}
          </ContextSelectorItem>
        ))
      )}
    </ContextSelector>
  );
};

export default ProjectSelector;
