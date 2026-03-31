import React, { useState, useMemo, useEffect } from 'react';
import {
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  MenuToggleElement,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
  Button,
} from '@patternfly/react-core';
import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';
import useSWR from 'swr';
import { apiPaths, fetcherItemsInAllPages } from '@app/api';
import { ResourcePool } from '@app/types';
import { compareK8sObjectsArr, FETCH_BATCH_LIMIT } from '@app/util';

const ResourcePoolSelector: React.FC<{
  catalogItemName?: string;
  disableAutoSelect?: boolean;
  selectedPool?: string;
  onSelect: (poolName: string | undefined) => void;
}> = ({ catalogItemName, disableAutoSelect = false, selectedPool, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('');

  const { data: resourcePools = [] } = useSWR<ResourcePool[]>(
    apiPaths.RESOURCE_POOLS({ limit: 'ALL' }),
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.RESOURCE_POOLS({
          limit: FETCH_BATCH_LIMIT,
          continueId,
        }),
      ),
    {
      refreshInterval: 30000,
      compare: compareK8sObjectsArr,
    },
  );

  const filteredPools = useMemo(() => {
    if (!filterValue) {
      return resourcePools;
    }
    const lowerFilter = filterValue.toLowerCase();
    return resourcePools.filter((pool) => pool.metadata.name.toLowerCase().includes(lowerFilter));
  }, [resourcePools, filterValue]);

  useEffect(() => {
    if (!disableAutoSelect && catalogItemName && resourcePools.length > 0 && selectedPool === undefined) {
      const matchingPool = resourcePools.find((pool) => pool.metadata.name === catalogItemName);
      if (matchingPool) {
        onSelect(matchingPool.metadata.name);
      }
    }
  }, [catalogItemName, disableAutoSelect, resourcePools, selectedPool, onSelect]);

  const onToggleClick = () => {
    setIsOpen(!isOpen);
  };

  const onSelectOption = (_event: React.MouseEvent<Element, MouseEvent> | undefined, value: string | number | undefined) => {
    onSelect(value as string);
    setFilterValue('');
    setIsOpen(false);
  };

  const onTextInputChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setFilterValue(value);
  };

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle
      ref={toggleRef}
      variant="typeahead"
      onClick={onToggleClick}
      isExpanded={isOpen}
      isFullWidth
      style={{ maxWidth: 'var(--babylon-form-width)' }}
    >
      <TextInputGroup isPlain>
        <TextInputGroupMain
          value={isOpen ? filterValue : selectedPool || ''}
          onClick={onToggleClick}
          onChange={onTextInputChange}
          autoComplete="off"
          placeholder="Select a pool (optional)"
          aria-label="Select a resource pool"
        />
        {(selectedPool || filterValue) && (
          <TextInputGroupUtilities>
            <Button
              variant="plain"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(undefined);
                setFilterValue('');
              }}
              aria-label="Clear selection"
            >
              <TimesIcon aria-hidden />
            </Button>
          </TextInputGroupUtilities>
        )}
      </TextInputGroup>
    </MenuToggle>
  );

  return (
    <Select
      id="resource-pool-selector"
      isOpen={isOpen}
      selected={selectedPool}
      onSelect={onSelectOption}
      onOpenChange={(open) => setIsOpen(open)}
      toggle={toggle}
      shouldFocusToggleOnSelect
    >
      <SelectList style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {filteredPools.length === 0 ? (
          <SelectOption isDisabled key="no-results">
            {filterValue ? 'No pools match your filter' : 'No pools available'}
          </SelectOption>
        ) : (
          <>
            <SelectOption key="disabled" value="disabled">
              Disabled
            </SelectOption>
            {filteredPools.map((pool) => (
              <SelectOption key={pool.metadata.name} value={pool.metadata.name}>
                {pool.metadata.name}
              </SelectOption>
            ))}
          </>
        )}
      </SelectList>
    </Select>
  );
};

export default ResourcePoolSelector;
