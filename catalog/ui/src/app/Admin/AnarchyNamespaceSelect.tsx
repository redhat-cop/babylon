import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Select, SelectOption, SelectVariant } from '@patternfly/react-core';
import { listNamespaces } from '@app/api';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { Namespace } from '@app/types';

const AnarchyNamespaceSelect: React.FC<{
  namespace: string;
  onSelect: (string) => void;
}> = ({ namespace, onSelect }) => {
  const componentWillUnmount = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [fetchState, reduceFetchState] = useReducer(k8sFetchStateReducer, null);

  const anarchyNamespaces: Namespace[] = (fetchState?.items as Namespace[]) || [];

  async function fetchAnarchyNamespaces() {
    const namespaceList = await listNamespaces({
      labelSelector: 'app.kubernetes.io/name=anarchy',
    });
    if (!fetchState.activity.canceled) {
      reduceFetchState({
        type: 'post',
        k8sObjectList: namespaceList,
      });
    }
  }

  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  useEffect(() => {
    if (!fetchState) {
      reduceFetchState({ type: 'startFetch' });
    } else if (fetchState.canContinue) {
      fetchAnarchyNamespaces();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(fetchState);
      }
    };
  }, [fetchState]);

  return (
    <Select
      aria-label="Namespace Filter"
      isOpen={isOpen}
      onSelect={(event, value) => {
        const valueKey: string = value as string;
        onSelect(valueKey === '-' ? null : valueKey);
        setIsOpen(false);
      }}
      onToggle={() => setIsOpen((v) => !v)}
      selections={namespace || '-'}
      variant={SelectVariant.single}
    >
      {[
        <SelectOption key="-" value="-">
          All Namespaces
        </SelectOption>,
        ...anarchyNamespaces.map((ns) => (
          <SelectOption key={ns.metadata.name} value={ns.metadata.name}>
            {ns.metadata.name}
          </SelectOption>
        )),
      ]}
    </Select>
  );
};

export default AnarchyNamespaceSelect;
