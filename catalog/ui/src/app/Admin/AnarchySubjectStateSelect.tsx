import React, { useState } from 'react';
import { Select, SelectOption, MenuToggle, SelectList, MenuToggleElement } from '@patternfly/react-core';

const AnarchySubjectStateSelect: React.FC<{
  state: string;
  onSelect: (v: string) => void;
}> = ({ state, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);

  const onToggleClick = () => {
    setIsOpen(!isOpen);
  };
  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={isOpen}>
      {state
        ? state
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
        : 'All States'}
    </MenuToggle>
  );

  return (
    <Select
      aria-label="State Filter"
      isOpen={isOpen}
      onSelect={(event, value) => {
        const valueKey: string = value as string;
        onSelect(valueKey === '-' ? null : valueKey);
        setIsOpen(false);
      }}
      selected={state || '-'}
      onOpenChange={(isOpen) => setIsOpen(isOpen)}
      toggle={toggle}
    >
      <SelectList>
        <SelectOption key="-" value="-">
          All States
        </SelectOption>
        <SelectOption key="destroying" value="destroying">
          Destroying
        </SelectOption>
        <SelectOption key="destroy-failed" value="destroy-failed">
          Destroy Failed
        </SelectOption>
        <SelectOption key="destroy-error" value="destroy-error">
          Destroy Error
        </SelectOption>
        <SelectOption key="provisioning" value="provisioning">
          Provisioning
        </SelectOption>
        <SelectOption key="provision-failed" value="provision-failed">
          Provision Failed
        </SelectOption>
        <SelectOption key="new" value="new">
          New
        </SelectOption>
        <SelectOption key="started" value="started">
          Started
        </SelectOption>
        <SelectOption key="start-failed" value="start-failed">
          Start Failed
        </SelectOption>
        <SelectOption key="stopped" value="stopped">
          Stopped
        </SelectOption>
        <SelectOption key="stop-failed" value="start-failed">
          Stop Failed
        </SelectOption>
      </SelectList>
    </Select>
  );
};

export default AnarchySubjectStateSelect;
