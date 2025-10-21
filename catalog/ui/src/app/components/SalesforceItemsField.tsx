import React, { useEffect, useMemo, useState, useCallback, ReactNode } from 'react';
import { Button, FormGroup, TextInput, Tooltip, Radio, HelperText, HelperTextItem } from '@patternfly/react-core';
import { OutlinedQuestionCircleIcon, PlusCircleIcon, TrashIcon, SearchIcon } from '@patternfly/react-icons';
import { SalesforceItem, SfdcType } from '@app/types';
import useDebounce from '@app/utils/useDebounce';
import { checkSalesforceId, apiFetch } from '@app/api';
import SearchSalesforceIdModal from '@app/components/SearchSalesforceIdModal';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';

type SalesforceItemWithOptionalType = Omit<SalesforceItem, 'type'> & {
  type: SfdcType | null;
  validating?: boolean;
  valid?: boolean;
  message?: string;
};

const validateItem = async (item: SalesforceItemWithOptionalType): Promise<SalesforceItemWithOptionalType> => {
  if (!item?.id || !item?.type) {
    return { ...item, validating: false, valid: false, message: '' };
  }
  const { valid, message } = await checkSalesforceId(item.id, apiFetch, item.type);
  return { ...item, validating: false, valid, message: valid ? '' : message };
};

const SalesforceItemsField: React.FC<{
  label?: ReactNode;
  helperText?: string;
  items: SalesforceItem[];
  onChange: (items: SalesforceItem[]) => void;
  isRequired?: boolean;
  fieldId?: string;
  standalone?: boolean;
}> = ({ label = 'Salesforce items', helperText, items, onChange, isRequired = false, fieldId = 'salesforce-items', standalone = true }) => {
  const { sfdc_enabled } = useInterfaceConfig();
  const [localItems, setLocalItems] = useState<SalesforceItemWithOptionalType[]>(() => {
    const mappedItems = (items || []).map((i) => ({ 
      ...i, 
      type: (i.type as SfdcType) || null, 
      validating: false, 
      valid: true, 
      message: '' 
    }));
    // If no items provided, show one empty item by default
    return mappedItems.length > 0 ? mappedItems : [{ id: '', type: null, validating: false, valid: false, message: '' }];
  });
  const [searchRowIdx, setSearchRowIdx] = useState<number | null>(null);

  useEffect(() => {
    // Only update local state if the items prop has meaningful data
    // This prevents the parent from resetting our local state when we're just adding empty items
    if (items && items.length > 0) {
      const mappedItems = items.map((i) => ({ 
        ...i, 
        type: (i.type as SfdcType) || null, 
        validating: false, 
        valid: true, 
        message: '' 
      }));
      setLocalItems(mappedItems);
    }
    // If items is empty and we have no local items, initialize with one empty item
    else if (!items || items.length === 0) {
      setLocalItems((prev) => {
        // Only initialize if we don't have any local items yet
        if (prev.length === 0) {
          return [{ id: '', type: null, validating: false, valid: false, message: '' }];
        }
        return prev; // Keep existing local items
      });
    }
  }, [items]);

  const debouncedValidate = useDebounce(async (idx: number, item: SalesforceItemWithOptionalType) => {
    const validated = await validateItem({ ...item, validating: true });
    setLocalItems((prev) => prev.map((it, i) => (i === idx ? validated : it)));
  }, 600);
  const handleTypeChange = useCallback((idx: number, type: SfdcType) => {
    setLocalItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, type, validating: !!it.id } : it));
      // Include items that have a type (even if no id yet) - this allows the radio button to stay selected
      const validItems = next.filter(item => item.type).map(({ id, type }) => ({ id: id || '', type }));
      onChange(validItems);
      if (next[idx].id) debouncedValidate(idx, next[idx]);
      return next;
    });
  }, [debouncedValidate, onChange]);

  const handleIdChange = useCallback((idx: number, id: string) => {
    setLocalItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, id, validating: !!it.type } : it));
      // Include items that have a type (even if no id yet) - this allows the radio button to stay selected
      const validItems = next.filter(item => item.type).map(({ id, type }) => ({ id: id || '', type }));
      onChange(validItems);
      if (next[idx].type) debouncedValidate(idx, next[idx]);
      return next;
    });
  }, [debouncedValidate, onChange]);

  const addItem = useCallback(() => {
    setLocalItems((prev) => {
      const next = [...prev, { id: '', type: null, validating: false, valid: false, message: '' }];
      // Don't call onChange when adding an empty item - this prevents the parent from resetting our state
      return next;
    });
  }, []);

  const removeItem = useCallback((idx: number) => {
    setLocalItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // If removing the last item, add an empty one
      const finalItems = next.length === 0 ? [{ id: '', type: null, validating: false, valid: false, message: '' }] : next;
      // Include items that have a type (even if no id yet) - this allows the radio button to stay selected
      const validItems = finalItems.filter(item => item.type).map(({ id, type }) => ({ id: id || '', type }));
      onChange(validItems);
      return finalItems;
    });
  }, [onChange]);

  const handleRemoveItem = useCallback((idx: number) => {
    removeItem(idx);
  }, [removeItem]);

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
        <div key={`sfdc-row-${idx}`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, minWidth: '600px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 4 }}>
              <Radio
                isChecked={item.type === 'campaign'}
                name={`sfdc-type-${idx}`}
                onChange={() => handleTypeChange(idx, 'campaign')}
                label="Campaign"
                id={idx === 0 ? `${fieldId}-campaign` : `sfdc-type-${idx}-campaign`}
              />
              <Radio
                isChecked={item.type === 'opportunity'}
                name={`sfdc-type-${idx}`}
                onChange={() => handleTypeChange(idx, 'opportunity')}
                label="Opportunity"
                id={`sfdc-type-${idx}-opportunity`}
              />
              <Radio
                isChecked={item.type === 'project'}
                name={`sfdc-type-${idx}`}
                onChange={() => handleTypeChange(idx, 'project')}
                label="Project"
                id={`sfdc-type-${idx}-project`}
              />
              <Tooltip
                position="right"
                content={<div>Salesforce ID type: Opportunity ID, Campaign ID or Project ID.</div>}
              >
                <OutlinedQuestionCircleIcon
                  aria-label="Salesforce ID type: Opportunity ID, Campaign ID or Project ID."
                  className="tooltip-icon-only"
                />
              </Tooltip>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap' }}>
              <Button
                variant="secondary"
                icon={<SearchIcon />}
                onClick={() => setSearchRowIdx(idx)}
                isDisabled={!item.type}
                style={{ minWidth: '120px', flexShrink: 0 }}
              >
                Id Finder
              </Button>
            <TextInput
              style={{ minWidth: '300px', flex: 1 }}
              id={idx === 0 ? fieldId : `salesforce-id-${idx}`}
              value={item.id || ''}
              onChange={(_e, v) => handleIdChange(idx, v as string)}
              validated={!item.id ? 'default' : item.validating ? 'default' : item.valid ? 'success' : 'error'}
              placeholder="Enter Salesforce ID..."
            />
            <Tooltip position="right" content={<div>Salesforce Opportunity ID, Campaign ID or Project ID.</div>}>
              <OutlinedQuestionCircleIcon className="tooltip-icon-only" style={{ flexShrink: 0 }} />
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
          {idx > 0 && (
            <Button 
              variant="plain" 
              aria-label="Remove" 
              onClick={() => handleRemoveItem(idx)} 
              icon={<TrashIcon />} 
            />
          )}
        </div>
       )),
    [localItems, handleTypeChange, handleIdChange, handleRemoveItem, fieldId],
  );

  const content = (
    <>
      <div style={{ minWidth: '600px', maxWidth: '800px' }}>{rows}</div>
      <Button variant="link" icon={<PlusCircleIcon />} onClick={addItem} style={{ marginTop: 8 }}>
        Add item
      </Button>
      {helperText ? (
        <div style={{ marginTop: 12, color: 'var(--pf-t--global--text--color--subtle)', fontSize: 14, maxWidth: '600px' }}>
          {helperText}
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {!sfdc_enabled ? null : standalone ? (
        <FormGroup label={label} fieldId={fieldId} isRequired={isRequired}>
          {content}
        </FormGroup>
      ) : (
        content
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



