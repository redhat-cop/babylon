import React, { useState } from 'react';
import { Select, SelectOption, SelectVariant } from '@patternfly/react-core';

const AnarchyRunnerStateSelect: React.FC<{
  runnerState?: string;
  onSelect: (s: string) => void;
}> = ({ runnerState, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Select
      aria-label="Runner State Filter"
      isOpen={isOpen}
      onSelect={(event, value) => {
        const valueKey: string = value as string;
        onSelect(valueKey === '-' ? null : valueKey);
        setIsOpen(false);
      }}
      onToggle={() => setIsOpen((v) => !v)}
      selections={runnerState || '-'}
      variant={SelectVariant.single}
    >
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
    </Select>
  );
};

export default AnarchyRunnerStateSelect;
