import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import useSession from '@app/utils/useSession';
import { ContextSelector, ContextSelectorItem } from '@patternfly/react-core';
import { NamespaceList, ServiceNamespace } from '@app/types';
import { apiPaths, fetcher } from '@app/api';

import './service-namespace-select.css';

const ServiceNamespaceSelect: React.FC<{
  allowSelectAll?: boolean;
  currentNamespaceName: string;
  isPlain?: boolean;
  isText?: boolean;
  onSelect: (namespace: ServiceNamespace) => void;
  selectWorkshopNamespace?: boolean;
}> = ({
  allowSelectAll = false,
  currentNamespaceName,
  isPlain = false,
  isText = false,
  onSelect,
  selectWorkshopNamespace = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = React.useState('');
  const {
    isAdmin,
    serviceNamespaces: sessionServiceNamespaces,
    workshopNamespaces: sessionWorkshopNamespaces,
  } = useSession().getSession();
  const enableFetchNamespaces = isAdmin;
  const { data: userNamespaceList } = useSWR<NamespaceList>(
    enableFetchNamespaces ? apiPaths.NAMESPACES({ labelSelector: 'usernamespace.gpte.redhat.com/user-uid' }) : '',
    fetcher
  );

  const serviceNamespaces: ServiceNamespace[] = useMemo(() => {
    return enableFetchNamespaces
      ? userNamespaceList.items.map((ns): ServiceNamespace => {
          return {
            name: ns.metadata.name,
            displayName: ns.metadata.annotations['openshift.io/display-name'] || ns.metadata.name,
          };
        })
      : selectWorkshopNamespace
      ? sessionWorkshopNamespaces
      : sessionServiceNamespaces;
  }, [enableFetchNamespaces, sessionServiceNamespaces, userNamespaceList]);

  const currentNamespace: ServiceNamespace | null = currentNamespaceName
    ? serviceNamespaces.find((ns) => ns.name === currentNamespaceName)
    : null;

  return (
    <ContextSelector
      className="service-namespace-select"
      isOpen={isOpen}
      isPlain={isPlain}
      isText={isText}
      onSearchInputChange={(value: string) => setSearchValue(value)}
      onToggle={() => setIsOpen((v) => !v)}
      searchInputValue={searchValue}
      toggleText={currentNamespace ? currentNamespace.displayName : 'All Projects'}
    >
      {allowSelectAll ? (
        <ContextSelectorItem
          key="*"
          onClick={() => {
            onSelect(null);
            setIsOpen(false);
          }}
        >
          All Projects
        </ContextSelectorItem>
      ) : (
        []
      )}

      {serviceNamespaces
        .filter(
          (ns) =>
            ns.name.toLowerCase().includes(searchValue.toLowerCase()) ||
            ns.displayName.toLowerCase().includes(searchValue.toLowerCase())
        )
        .map((ns) => (
          <ContextSelectorItem
            key={ns.name}
            onClick={() => {
              onSelect(ns);
              setIsOpen(false);
            }}
          >
            {ns.displayName || ns.name}
          </ContextSelectorItem>
        ))}
    </ContextSelector>
  );
};

export default ServiceNamespaceSelect;
