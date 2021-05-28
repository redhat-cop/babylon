import * as React from 'react';

import {
  Dropdown,
  DropdownItem,
  DropdownToggle,
} from '@patternfly/react-core';

import './action-dropdown.css';

export interface ActionDropdownProps {
  actionDropdownItems: any;
  position: string;
}

export interface ActionDropdownItemProps {
  isDisabled?: boolean;
  label: string;
  onSelect: () => void;
}

const ActionDropdown: React.FunctionComponent<ActionDropdownProps> = ({
  actionDropdownItems,
  position,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <Dropdown className="rhpds-action-dropdown"
      isOpen={isOpen}
      onSelect={() => setIsOpen(false)}
      position={position}
      toggle={<DropdownToggle onToggle={() => setIsOpen(v => !v)}>Actions</DropdownToggle>}
      dropdownItems={actionDropdownItems}
    />
  );
}

const ActionDropdownItem: React.FunctionComponent<ActionDropdownItemProps> = ({
  label,
  isDisabled = false,
  onSelect,
}) => {
  return (
    <DropdownItem key={label} 
      isDisabled={isDisabled}
      onClick={() => onSelect()}
    >{label}</DropdownItem>
  );
}

export { ActionDropdown, ActionDropdownItem };
