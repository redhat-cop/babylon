import * as React from 'react';

import {
  Dropdown,
  DropdownItem,
  DropdownToggle,
  PageSection,
  PageSectionVariants,
} from '@patternfly/react-core';

import { ServiceNamespace } from '../../../../src/app/types';

import './services-namespace-selector.css';

export interface ServicesNamespaceSelectorProps {
  current: string | undefined;
  namespaces: ServiceNamespace[];
  onSelect: (ns?: string) => void;
}

const ServicesNamespaceSelector: React.FunctionComponent<ServicesNamespaceSelectorProps> = ({
  current,
  namespaces,
  onSelect,
}) => {
  const currentNamespace = namespaces.find(ns => ns.name == current);

  const [isOpen, setIsOpen] = React.useState(false);

  function selectAllNamespaces() {
    setIsOpen(false);
    onSelect();
  }

  function selectNamespace(namespaceName) {
    setIsOpen(false);
    onSelect(namespaceName);
  }

  return (
    <PageSection variant={PageSectionVariants.light} className="rhpds-services-namespace-selector">
      <Dropdown isPlain
        isOpen={isOpen}
        toggle={
          <DropdownToggle onToggle={() => setIsOpen(v => !v)}>
            Project: {currentNamespace ? currentNamespace.displayName : "all projects"}
          </DropdownToggle>
        }
        dropdownItems={[
            <DropdownItem key="*"
              onClick={() => selectAllNamespaces() }
            >- all projects -</DropdownItem>
          ].concat(namespaces.map(namespace =>
            <DropdownItem key={namespace.name}
              onClick={() => selectNamespace(namespace.name) }
            >{namespace.displayName}</DropdownItem>
          ))
        }
      />
    </PageSection>
  );
}

export { ServicesNamespaceSelector };
