import React from "react";
import { useEffect, useState } from "react";
import {
  Select,
  SelectOption,
  SelectVariant,
} from '@patternfly/react-core';
import {
  listNamespaces,
} from '@app/api';

export interface AnarchyNamespaceSelectProps {
  namespace: string;
  onSelect: (string) => void;
}

const AnarchyNamespaceSelect: React.FunctionComponent<AnarchyNamespaceSelectProps> = ({
  namespace,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [anarchyNamespaces, setAnarchyNamespaces] = useState([]);

  async function fetchAnarchyNamespaces() {
    const namespaceList = await listNamespaces({
      labelSelector: "app.kubernetes.io/name=anarchy",
    });
    setAnarchyNamespaces(namespaceList.items || []);
  }

  useEffect(() => {
    fetchAnarchyNamespaces();
  }, []);

  return (
    <Select
      aria-label="Namespace Filter"
      isOpen={isOpen}
      onSelect={(event, value) => {
        const valueKey:string = value as string;
        onSelect(valueKey === "-" ? null : valueKey);
        setIsOpen(false);
      }}
      onToggle={() => setIsOpen(v => !v)}
      selections={namespace || "-"}
      variant={SelectVariant.single}
    >
      {[
        <SelectOption key="-" value="-">All Namespaces</SelectOption>,
        ...anarchyNamespaces.map(ns =>
          <SelectOption
            key={ns.metadata.name}
            value={ns.metadata.name}
          >{ns.metadata.name}</SelectOption>
        )
      ]}
    </Select>
  );
}

export { AnarchyNamespaceSelect };
