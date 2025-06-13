import React from 'react';
import { Dropdown, DropdownItem, DropdownList, MenuToggle, MenuToggleElement } from '@patternfly/react-core';
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
      onOpenChange={(isOpen: boolean) => setIsOpen(isOpen)}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          icon={isPlain ? null : <CaretDownIcon />}
          isDisabled={isDisabled}
          onClick={() => setIsOpen((v) => !v)}
        >
          {icon ? <Icon /> : 'Actions'}
        </MenuToggle>
      )}
    >
      <DropdownList>{actionDropdownItems.map((item) => item)}</DropdownList>
    </Dropdown>
  );
};

const ActionDropdownItem: React.FC<{
  isDisabled?: boolean;
  label: string;
  onSelect: () => void;
  className?: string;
  icon?: React.ReactNode;
}> = ({ label, className, isDisabled = false, onSelect, icon }) => {
  return (
    <DropdownItem
      className={className}
      key={label}
      isDisabled={isDisabled}
      onClick={() => (isDisabled === true ? null : onSelect())}
      icon={icon}
    >
      {label}
    </DropdownItem>
  );
};

export { ActionDropdown, ActionDropdownItem };
