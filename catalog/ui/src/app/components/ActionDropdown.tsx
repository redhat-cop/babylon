import React from 'react';
import { Dropdown, DropdownItem, DropdownList, MenuToggle, MenuToggleElement } from '@patternfly/react-core';
import { SVGIconProps } from '@patternfly/react-icons/dist/js/createIcon';

import './action-dropdown.css';

const ActionDropdown: React.FC<{
  actionDropdownItems: any;
  className?: string;
  isDisabled?: boolean;
  position?: 'right' | 'left' | 'center' | 'end' | 'start';
  icon?: React.ComponentClass<SVGIconProps>;
  isPlain?: boolean;
}> = ({ actionDropdownItems, className, isDisabled = false, icon, position, isPlain = false }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const Icon = icon;
  return (
    <Dropdown
      className={`action-dropdown${className ? ` ${className}` : ''}`}
      isOpen={isOpen}
      onSelect={() => setIsOpen(false)}
      onOpenChange={(isOpen: boolean) => setIsOpen(isOpen)}
      popperProps={{ position }}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          isDisabled={isDisabled}
          onClick={() => setIsOpen((v) => !v)}
          variant={isPlain ? 'plain' : 'default'}
        >
          {icon ? <Icon /> : 'Actions'}
        </MenuToggle>
      )}
    >
      <DropdownList>{actionDropdownItems.map((item: any) => item)}</DropdownList>
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
      value={label}
      isDisabled={isDisabled}
      onClick={() => (isDisabled === true ? null : onSelect())}
      icon={icon}
    >
      {label}
    </DropdownItem>
  );
};

export { ActionDropdown, ActionDropdownItem };
