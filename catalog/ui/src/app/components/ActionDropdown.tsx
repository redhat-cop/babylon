import React from 'react';
import { Dropdown, DropdownItem, MenuToggle, MenuToggleElement } from '@patternfly/react-core';
import CaretDownIcon from '@patternfly/react-icons/dist/js/icons/caret-down-icon';
import { SVGIconProps } from '@patternfly/react-icons/dist/js/createIcon';

import './action-dropdown.css';

const ActionDropdown: React.FC<{
  actionDropdownItems: any;
  className?: string;
  isDisabled?: boolean;
  icon?: React.ComponentClass<SVGIconProps>;
  isPlain?: boolean;
}> = ({ actionDropdownItems, className, isDisabled = false, icon, isPlain = false }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const Icon = icon;
  return (
    <Dropdown
      className={`action-dropdown${className ? ` ${className}` : ''}`}
      isOpen={isOpen}
      onSelect={() => setIsOpen(false)}
      isPlain={isPlain}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          isDisabled={isDisabled}
          onClick={() => setIsOpen((v) => !v)}
          ref={toggleRef}
          isExpanded={isOpen}
        >
          {icon ? <Icon /> : 'Actions'}{isPlain ? null : <CaretDownIcon />}
        </MenuToggle>
      )}>{actionDropdownItems}</Dropdown>
  );
};

const ActionDropdownItem: React.FC<{
  isDisabled?: boolean;
  label: string;
  onSelect: () => void;
  className?: string;
}> = ({ label, className, isDisabled = false, onSelect }) => {
  return (
    <DropdownItem className={className} key={label} isDisabled={isDisabled} onClick={() => onSelect()}>
      {label}
    </DropdownItem>
  );
};

export { ActionDropdown, ActionDropdownItem };
