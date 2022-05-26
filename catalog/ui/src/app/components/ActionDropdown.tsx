import * as React from 'react';
import classNames from 'classnames';

import { Dropdown, DropdownItem, DropdownPosition, DropdownToggle } from '@patternfly/react-core';

import './action-dropdown.css';
import { SVGIconProps } from '@patternfly/react-icons/dist/esm/createIcon';
import { CaretDownIcon } from '@patternfly/react-icons';

export interface ActionDropdownProps {
  actionDropdownItems: any;
  className?: string;
  isDisabled?: boolean;
  position: DropdownPosition | 'right' | 'left';
  icon?: React.ComponentClass<SVGIconProps>;
  isPlain?: boolean;
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
  isDisabled = false,
  position,
  icon,
  isPlain = false,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const Icon = icon;
  return (
    <Dropdown
      className={classNames('rhpds-action-dropdown', className)}
      isOpen={isOpen}
      onSelect={() => setIsOpen(false)}
      position={position}
      isPlain={isPlain}
      toggle={
        <DropdownToggle
          toggleIndicator={isPlain ? null : CaretDownIcon}
          isDisabled={isDisabled}
          onToggle={() => setIsOpen((v) => !v)}
        >
          {icon ? <Icon /> : 'Actions'}
        </DropdownToggle>
      }
      dropdownItems={actionDropdownItems}
    />
  );
};

const ActionDropdownItem: React.FunctionComponent<ActionDropdownItemProps> = ({
  label,
  isDisabled = false,
  onSelect,
}) => {
  return (
    <DropdownItem key={label} isDisabled={isDisabled} onClick={() => onSelect()}>
      {label}
    </DropdownItem>
  );
};

export { ActionDropdown, ActionDropdownItem };
