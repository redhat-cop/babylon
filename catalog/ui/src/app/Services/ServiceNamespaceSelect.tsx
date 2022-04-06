import React from 'react';
import { useState } from 'react';
import { useSelector } from 'react-redux';

import { Dropdown, DropdownItem, DropdownToggle } from '@patternfly/react-core';

import { selectServiceNamespaces } from '@app/store';

import { ServiceNamespace } from '@app/types';

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
  const currentNamespace: ServiceNamespace | null = currentNamespaceName
    ? serviceNamespaces.find((ns) => ns.name === currentNamespaceName)
    : null;

  const dropdownItems = [
    <DropdownItem
      key="*"
      onClick={() => {
        onSelect(null);
        setIsOpen(false);
      }}
    >
      - all projects -
    </DropdownItem>,
    ...serviceNamespaces.map((ns) => (
      <DropdownItem
        key={ns.name}
        onClick={() => {
          onSelect(ns.name);
          setIsOpen(false);
        }}
      >
        {ns.displayName || ns.name}
      </DropdownItem>
    )),
  ];

  // Ensure that current value appears in namespace list.
  if (currentNamespaceName && !currentNamespace) {
    dropdownItems.push(
      <DropdownItem
        key={currentNamespaceName}
        onClick={() => {
          onSelect(currentNamespaceName);
          setIsOpen(false);
        }}
      >
        {currentNamespaceName}
      </DropdownItem>
    );
  }

  return (
    <Dropdown
      isPlain
      dropdownItems={dropdownItems}
      isOpen={isOpen}
      toggle={
        <DropdownToggle onToggle={() => setIsOpen((v) => !v)}>
          Project: {currentNamespace ? currentNamespace.displayName : currentNamespaceName || 'all projects'}
        </DropdownToggle>
      }
    />
  );
};

export default ServiceNamespaceSelect;
