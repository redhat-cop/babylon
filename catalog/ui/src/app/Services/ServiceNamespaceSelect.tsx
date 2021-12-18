import React from "react";
import { useState } from "react";
import { useSelector } from 'react-redux';

import {
  Dropdown,
  DropdownItem,
  DropdownToggle,
} from '@patternfly/react-core';

import {
  selectServiceNamespaces,
} from '@app/store';

import {
  ServiceNamespace,
} from '@app/types';

export interface ServiceNamespaceSelectProps {
  currentNamespaceName: string;
  serviceNamespaces: ServiceNamespace[];
  onSelect: (string) => void;
}

const ServiceNamespaceSelect: React.FunctionComponent<ServiceNamespaceSelectProps> = ({
  currentNamespaceName,
  serviceNamespaces,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const currentNamespace:ServiceNamespace|null = currentNamespaceName ? serviceNamespaces.find(ns => ns.name === currentNamespaceName) : null;

  return (
    <Dropdown isPlain
      dropdownItems={[
        <DropdownItem key="*" onClick={() => {
          onSelect(null);
          setIsOpen(false);
        }}>- all projects -</DropdownItem>,
        ...serviceNamespaces.map(ns =>
          <DropdownItem key={ns.name} onClick={() => {
            onSelect(ns.name);
            setIsOpen(false);
          }}>{ns.displayName || ns.name}</DropdownItem>
        )
      ]}
      isOpen={isOpen}
      toggle={
        <DropdownToggle onToggle={() => setIsOpen(v => !v)}>
          Project: {currentNamespace ? currentNamespace.displayName : "all projects"}
        </DropdownToggle>
      }
    />
  );
}

export default ServiceNamespaceSelect;
