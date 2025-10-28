import React, { useState, useCallback, ReactNode, useMemo, useEffect } from 'react';
import { Button, FormGroup, TextInput, Tooltip, Radio, HelperText, HelperTextItem } from '@patternfly/react-core';
import { OutlinedQuestionCircleIcon, PlusCircleIcon, SearchIcon, TrashIcon } from '@patternfly/react-icons';
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
  hideExistingItems?: boolean;
}> = ({ label = 'Salesforce items', helperText, items, onChange, isRequired = false, fieldId = 'salesforce-items', standalone = true, hideExistingItems = false }) => {
  const { sfdc_enabled } = useInterfaceConfig();
  
  // Existing items (from props) - these are read-only
  const existingItems = useMemo(() => items || [], [items]);
  
  // New item being added - this is the form state
  const [newItem, setNewItem] = useState<SalesforceItemWithOptionalType>({
    id: '',
    type: null,
    validating: false,
    valid: false,
    message: '',
  });
  const [showAddForm, setShowAddForm] = useState(hideExistingItems || existingItems.length === 0);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const debouncedValidate = useDebounce(async (item: SalesforceItemWithOptionalType, currentItems: SalesforceItem[]) => {
    const validated = await validateItem({ ...item, validating: true });
    setNewItem(validated);
    
    // Auto-add if valid
    if (validated.valid && validated.id && validated.type) {
      onChange([...currentItems, { id: validated.id, type: validated.type as SfdcType }]);
      setNewItem({ id: '', type: null, validating: false, valid: false, message: '' });
      // Keep form visible when hideExistingItems is true
      if (!hideExistingItems) {
        setShowAddForm(false);
      }
    }
  }, 600);

  const handleTypeChange = useCallback((type: SfdcType) => {
    setNewItem(prev => {
      const updated = { ...prev, type, validating: !!prev.id };
      if (prev.id) {
        debouncedValidate({ ...prev, type }, existingItems);
      }
      return updated;
    });
  }, [debouncedValidate, existingItems]);

  const handleIdChange = useCallback((id: string) => {
    setNewItem(prev => {
      const updated = { ...prev, id, validating: !!prev.type };
      if (prev.type) {
        debouncedValidate({ ...prev, id }, existingItems);
      }
      return updated;
    });
  }, [debouncedValidate, existingItems]);

  const onSearchResult = useCallback((selectedId: string, selectedType: SfdcType) => {
    const updatedItem = { ...newItem, id: selectedId, type: selectedType, validating: false };
    setNewItem(updatedItem);
    setSearchModalOpen(false);
    debouncedValidate(updatedItem, existingItems);
  }, [newItem, debouncedValidate, existingItems]);

  // Ensure the form is always visible when hideExistingItems is true
  useEffect(() => {
    if (hideExistingItems && !showAddForm) {
      setShowAddForm(true);
    }
  }, [hideExistingItems, showAddForm]);

  // Show the form when there are no existing items
  useEffect(() => {
    if (existingItems.length === 0 && !showAddForm) {
      setShowAddForm(true);
    }
  }, [existingItems.length, showAddForm]);


  const content = (
    <>
      {/* Display existing items as read-only input fields */}
      {!hideExistingItems && existingItems.map((item, idx) => (
        <div key={`existing-${idx}`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, minWidth: '600px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 4 }}>
              <Radio
                isChecked={item.type === 'campaign'}
                name={`sfdc-type-existing-${idx}`}
                label="Campaign"
                id={`sfdc-type-existing-${idx}-campaign`}
              />
              <Radio
                isChecked={item.type === 'opportunity'}
                name={`sfdc-type-existing-${idx}`}
                label="Opportunity"
                id={`sfdc-type-existing-${idx}-opportunity`}
              />
              <Radio
                isChecked={item.type === 'project'}
                name={`sfdc-type-existing-${idx}`}
                label="Project"
                id={`sfdc-type-existing-${idx}-project`}
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
                style={{ minWidth: '120px', flexShrink: 0 }}
              >
                Id Finder
              </Button>
              <TextInput
                style={{ minWidth: '300px', flex: 1 }}
                id={`${fieldId}-existing-${idx}`}
                value={item.id || ''}
                validated="success"
                aria-label={`Salesforce ID: ${item.id}`}
              />
              <Tooltip position="right" content={<div>Salesforce Opportunity ID, Campaign ID or Project ID.</div>}>
                <OutlinedQuestionCircleIcon className="tooltip-icon-only" style={{ flexShrink: 0 }} />
              </Tooltip>
              <Button 
                variant="plain" 
                aria-label="Remove" 
                onClick={() => onChange(existingItems.filter((_, i) => i !== idx))}
                icon={<TrashIcon />}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add new item button - only show if form is hidden AND there are existing items */}
      {!showAddForm && existingItems.length > 0 && (
        <Button variant="link" icon={<PlusCircleIcon />} onClick={() => setShowAddForm(true)} style={{ marginTop: 8 }}>
          Add more Salesforce IDs
        </Button>
      )}

      {/* Add new item form */}
      {showAddForm && (
        <div style={{ marginTop: 0, marginBottom: 16, minWidth: '600px', maxWidth: '800px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 4 }}>
              <Radio
                isChecked={newItem.type === 'campaign'}
                name="new-sfdc-type"
                onChange={() => handleTypeChange('campaign')}
                label="Campaign"
                id={`${fieldId}-campaign-new`}
              />
              <Radio
                isChecked={newItem.type === 'opportunity'}
                name="new-sfdc-type"
                onChange={() => handleTypeChange('opportunity')}
                label="Opportunity"
                id={`${fieldId}-opportunity-new`}
              />
              <Radio
                isChecked={newItem.type === 'project'}
                name="new-sfdc-type"
                onChange={() => handleTypeChange('project')}
                label="Project"
                id={`${fieldId}-project-new`}
              />
              <Tooltip position="right" content={<div>Salesforce ID type: Opportunity ID, Campaign ID or Project ID.</div>}>
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
                onClick={() => setSearchModalOpen(true)}
                isDisabled={!newItem.type}
                style={{ minWidth: '120px', flexShrink: 0 }}
              >
                Id Finder
              </Button>
              <TextInput
                style={{ minWidth: '300px', flex: 1 }}
                id={fieldId}
                value={newItem.id || ''}
                onChange={(_e, v) => handleIdChange(v as string)}
                validated={!newItem.id ? 'default' : newItem.validating ? 'default' : newItem.valid ? 'success' : 'error'}
                placeholder="Enter Salesforce ID..."
              />
              <Tooltip position="right" content={<div>Salesforce Opportunity ID, Campaign ID or Project ID.</div>}>
                <OutlinedQuestionCircleIcon className="tooltip-icon-only" style={{ flexShrink: 0 }} />
              </Tooltip>
            </div>
            {newItem.message && (
              <HelperText>
                <HelperTextItem variant="error">{newItem.message}</HelperTextItem>
              </HelperText>
            )}
            {newItem.validating && (
              <HelperText>
                <HelperTextItem>Validating Salesforce ID...</HelperTextItem>
              </HelperText>
            )}
            {newItem.valid && newItem.id && (
              <HelperText>
                <HelperTextItem variant="success">Valid Salesforce {newItem.type} ID</HelperTextItem>
              </HelperText>
            )}
          </div>
        </div>
      )}

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
        <>
          {label && <label htmlFor={fieldId} style={{ display: 'none' }}>{label}</label>}
          {content}
        </>
      )}
      <SearchSalesforceIdModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSubmitCb={onSearchResult}
        defaultSfdcType={newItem.type as SfdcType}
      />
    </>
  );
};

export default SalesforceItemsField;
