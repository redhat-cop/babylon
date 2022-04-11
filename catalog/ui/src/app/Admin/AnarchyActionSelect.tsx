import React from 'react';
import { useState } from 'react';
import { Select, SelectOption, SelectVariant } from '@patternfly/react-core';

export interface AnarchyActionSelectProps {
  action: string;
  onSelect: (string) => void;
}

const AnarchyActionSelect: React.FunctionComponent<AnarchyActionSelectProps> = ({ action, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Select
      aria-label="Action Filter"
      isOpen={isOpen}
      onSelect={(event, value) => {
        const valueKey: string = value as string;
        onSelect(valueKey === '-' ? null : valueKey);
        setIsOpen(false);
      }}
      onToggle={() => setIsOpen((v) => !v)}
      selections={action || '-'}
      variant={SelectVariant.single}
    >
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
    </Select>
  );
};

export default AnarchyActionSelect;
