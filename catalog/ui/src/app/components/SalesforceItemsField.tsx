import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Button, FormGroup, TextInput, Tooltip, Split, SplitItem, Radio, HelperText, HelperTextItem } from '@patternfly/react-core';
import { OutlinedQuestionCircleIcon, PlusCircleIcon, TrashIcon, SearchIcon } from '@patternfly/react-icons';
import { SalesforceItem, SfdcType } from '@app/types';
import useDebounce from '@app/utils/useDebounce';
import { checkSalesforceId, apiFetch } from '@app/api';
import SearchSalesforceIdModal from '@app/components/SearchSalesforceIdModal';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';

type SalesforceItemWithState = SalesforceItem & {
  validating?: boolean;
  valid?: boolean;
  message?: string;
};

const validateItem = async (item: SalesforceItemWithState): Promise<SalesforceItemWithState> => {
  if (!item?.id || !item?.type) {
    return { ...item, validating: false, valid: false, message: '' };
  }
  const { valid, message } = await checkSalesforceId(item.id, apiFetch, item.type);
  return { ...item, validating: false, valid, message: valid ? '' : message };
};

const SalesforceItemsField: React.FC<{
  label?: string;
  helperText?: string;
  items: SalesforceItem[];
  onChange: (items: SalesforceItem[]) => void;
  isRequired?: boolean;
}> = ({ label = 'Salesforce items', helperText, items, onChange, isRequired = false }) => {
  const { sfdc_enabled } = useInterfaceConfig();
  const [localItems, setLocalItems] = useState<SalesforceItemWithState[]>(() => {
    const mappedItems = (items || []).map((i) => ({ ...i, validating: false, valid: true, message: '' }));
    // If no items provided, show one empty item by default
    return mappedItems.length > 0 ? mappedItems : [{ id: '', type: null as unknown as SfdcType, validating: false, valid: false, message: '' }];
  });
  const [searchRowIdx, setSearchRowIdx] = useState<number | null>(null);

  useEffect(() => {
    const mappedItems = (items || []).map((i) => ({ ...i, validating: false, valid: true, message: '' }));
    // If no items provided, show one empty item by default
    const itemsToShow = mappedItems.length > 0 ? mappedItems : [{ id: '', type: null as unknown as SfdcType, validating: false, valid: false, message: '' }];
    setLocalItems(itemsToShow);
  }, [items]);

  const debouncedValidate = useDebounce(async (idx: number, item: SalesforceItemWithState) => {
    const validated = await validateItem({ ...item, validating: true });
    setLocalItems((prev) => prev.map((it, i) => (i === idx ? validated : it)));
  }, 600);
  const handleTypeChange = useCallback((idx: number, type: SfdcType) => {
    setLocalItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, type, validating: !!it.id } : it));
      // Only include items that have both id and type
      const validItems = next.filter(item => item.id && item.type).map(({ id, type }) => ({ id, type }));
      onChange(validItems);
      if (next[idx].id) debouncedValidate(idx, next[idx]);
      return next;
    });
  }, [debouncedValidate, onChange]);

  const handleIdChange = useCallback((idx: number, id: string) => {
    setLocalItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, id, validating: !!it.type } : it));
      // Only include items that have both id and type
      const validItems = next.filter(item => item.id && item.type).map(({ id, type }) => ({ id, type }));
      onChange(validItems);
      if (next[idx].type) debouncedValidate(idx, next[idx]);
      return next;
    });
  }, [debouncedValidate, onChange]);

  const addItem = useCallback(() => {
    setLocalItems((prev) => {
      const next = [...prev, { id: '', type: null as unknown as SfdcType, validating: false, valid: false, message: '' }];
      // Only include items that have both id and type
      const validItems = next.filter(item => item.id && item.type).map(({ id, type }) => ({ id, type }));
      onChange(validItems);
      return next;
    });
  }, [onChange]);

  const removeItem = useCallback((idx: number) => {
    setLocalItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // If removing the last item, add an empty one
      const finalItems = next.length === 0 ? [{ id: '', type: null as unknown as SfdcType, validating: false, valid: false, message: '' }] : next;
      // Only include items that have both id and type
      const validItems = finalItems.filter(item => item.id && item.type).map(({ id, type }) => ({ id, type }));
      onChange(validItems);
      return finalItems;
    });
  }, [onChange]);

  const onSearchResult = useCallback(
    (selectedId: string, selectedType: SfdcType) => {
      if (searchRowIdx == null) return;
      handleIdChange(searchRowIdx, selectedId);
      handleTypeChange(searchRowIdx, selectedType);
      setSearchRowIdx(null);
    },
    [searchRowIdx, handleIdChange, handleTypeChange],
  );

  const rows = useMemo(
    () =>
      localItems.map((item, idx) => (
        <div key={`sfdc-row-${idx}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Split hasGutter>
              <SplitItem>
                <Radio
                  isChecked={item.type === 'campaign'}
                  name={`sfdc-type-${idx}`}
                  onChange={() => handleTypeChange(idx, 'campaign')}
                  label="Campaign"
                  id={`sfdc-type-${idx}-campaign`}
                />
              </SplitItem>
              <SplitItem>
                <Radio
                  isChecked={item.type === 'opportunity'}
                  name={`sfdc-type-${idx}`}
                  onChange={() => handleTypeChange(idx, 'opportunity')}
                  label="Opportunity"
                  id={`sfdc-type-${idx}-opportunity`}
                />
              </SplitItem>
              <SplitItem>
                <Radio
                  isChecked={item.type === 'project'}
                  name={`sfdc-type-${idx}`}
                  onChange={() => handleTypeChange(idx, 'project')}
                  label="Project"
                  id={`sfdc-type-${idx}-project`}
                />
              </SplitItem>
            </Split>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Button
                variant="secondary"
                icon={<SearchIcon />}
                onClick={() => setSearchRowIdx(idx)}
                isDisabled={!item.type}
              >
                Id Finder
              </Button>
            <TextInput
              style={{ width: 280 }}
              id={`salesforce-id-${idx}`}
              value={item.id || ''}
              onChange={(_e, v) => handleIdChange(idx, v as string)}
              validated={!item.id ? 'default' : item.validating ? 'default' : item.valid ? 'success' : 'error'}
            />
            <Tooltip position="right" content={<div>Salesforce Opportunity ID, Campaign ID or Project ID.</div>}>
              <OutlinedQuestionCircleIcon className="tooltip-icon-only" />
            </Tooltip>
            </div>
            {item.message && (
              <HelperText>
                <HelperTextItem variant="error">{item.message}</HelperTextItem>
              </HelperText>
            )}
            {item.validating && (
              <HelperText>
                <HelperTextItem>Validating Salesforce ID...</HelperTextItem>
              </HelperText>
            )}
            {item.valid && item.id && (
              <HelperText>
                <HelperTextItem variant="success">Valid Salesforce {item.type} ID</HelperTextItem>
              </HelperText>
            )}
          </div>
          <Button variant="plain" aria-label="Remove" onClick={() => removeItem(idx)} icon={<TrashIcon />} />
        </div>
       )),
    [localItems, handleTypeChange, handleIdChange, removeItem],
  );

  return (
    <>
      {!sfdc_enabled ? null : (
        <FormGroup label={label} fieldId="salesforce-items" isRequired={isRequired}>
      <div>{rows}</div>
      <Button variant="link" icon={<PlusCircleIcon />} onClick={addItem}>
        Add item
      </Button>
          {helperText ? (
            <div style={{ marginTop: 4, color: 'var(--pf-t--global--text--color--subtle)', fontSize: 14 }}>
              {helperText}
            </div>
          ) : null}
        </FormGroup>
      )}
      <SearchSalesforceIdModal
        isOpen={searchRowIdx != null}
        onClose={() => setSearchRowIdx(null)}
        onSubmitCb={onSearchResult}
        defaultSfdcType={searchRowIdx != null ? (localItems?.[searchRowIdx]?.type as SfdcType) : null}
      />
    </>
  );
};

export default SalesforceItemsField;



