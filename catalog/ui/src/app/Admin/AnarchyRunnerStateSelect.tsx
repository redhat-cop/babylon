import React, { useState } from 'react';
import { MenuToggle, MenuToggleElement, Select, SelectList, SelectOption } from '@patternfly/react-core';

const AnarchyRunnerStateSelect: React.FC<{
  runnerState?: string;
  onSelect: (s: string) => void;
}> = ({ runnerState, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);

  const onToggleClick = () => {
    setIsOpen(!isOpen);
  };
  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={isOpen}>
      {runnerState}
    </MenuToggle>
  );

  return (
    <Select
      aria-label="Runner State Filter"
      isOpen={isOpen}
      onSelect={(event, value) => {
        const valueKey: string = value as string;
        onSelect(valueKey === '-' ? null : valueKey);
        setIsOpen(false);
      }}
      selected={runnerState}
      onOpenChange={(isOpen) => setIsOpen(isOpen)}
      toggle={toggle}
    >
      <SelectList>
        <SelectOption key="-" value="-">
          All Runner States
        </SelectOption>
        <SelectOption key="failed" value="failed">
          Failed
        </SelectOption>
        <SelectOption key="incomplete" value="incomplete">
          Incomplete
        </SelectOption>
        <SelectOption key="pending" value="pending">
          Pending
        </SelectOption>
        <SelectOption key="queued" value="queued">
          Queued
        </SelectOption>
        <SelectOption key="running" value="running">
          Running
        </SelectOption>
        <SelectOption key="successful" value="successful">
          Successful
        </SelectOption>
      </SelectList>
    </Select>
  );
};

export default AnarchyRunnerStateSelect;
