import * as React from 'react';
import classNames from 'classnames';

import {
  Dropdown,
  DropdownItem,
  DropdownToggle,
} from '@patternfly/react-core';

import './action-dropdown.css';

export interface ActionDropdownProps {
  actionDropdownItems: any;
  className?: string;
  isDisabled?: boolean;
  position: string;
}

export interface ActionDropdownItemProps {
  className?: string;
  isDisabled?: boolean;
  label: string;
  onSelect: () => void;
}

const ActionDropdown: React.FunctionComponent<ActionDropdownProps> = ({
  actionDropdownItems,
  className,
  isDisabled,
  position,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <Dropdown
      className={classNames('rhpds-action-dropdown', className)}
      isOpen={isOpen}
      onSelect={() => setIsOpen(false)}
      position={position}
      toggle={<DropdownToggle isDisabled={isDisabled} onToggle={() => setIsOpen(v => !v)}>Actions</DropdownToggle>}
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
