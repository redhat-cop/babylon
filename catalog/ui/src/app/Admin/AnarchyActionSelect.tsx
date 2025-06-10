import React, { useState } from 'react';
import { MenuToggle, MenuToggleElement, Select, SelectList, SelectOption } from '@patternfly/react-core';

const AnarchyActionSelect: React.FC<{
  action: string;
  onSelect: (s: string) => void;
}> = ({ action, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);

  const onToggleClick = () => {
    setIsOpen(!isOpen);
  };
  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={isOpen}>
      {action || '-'}
    </MenuToggle>
  );

  return (
    <Select
      aria-label="Action Filter"
      isOpen={isOpen}
      onSelect={(event, value) => {
        const valueKey: string = value as string;
        onSelect(valueKey === '-' ? null : valueKey);
        setIsOpen(false);
      }}
      selected={action || '-'}
      onOpenChange={(isOpen) => setIsOpen(isOpen)}
      toggle={toggle}
    >
      <SelectList>
        <SelectOption key="-" value="-">
          All Actions
        </SelectOption>
        <SelectOption key="destroy" value="destroy">
          Destroy
        </SelectOption>
        <SelectOption key="provision" value="provision">
          Provision
        </SelectOption>
        <SelectOption key="start" value="start">
          Start
        </SelectOption>
        <SelectOption key="stop" value="stop">
          Stop
        </SelectOption>
      </SelectList>
    </Select>
  );
};

export default AnarchyActionSelect;
