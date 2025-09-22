import React, { useState, useEffect, useCallback } from 'react';
import {
  FormGroup,
  TextInput,
  Button,
  Radio,
  Split,
  SplitItem,
  Tooltip,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { SearchIcon, OutlinedQuestionCircleIcon } from '@patternfly/react-icons';
import { SfdcType } from '@app/types';
import { checkSalesforceId, apiFetch } from '@app/api';
import useDebounce from '@app/utils/useDebounce';
import SearchSalesforceIdModal from '@app/components/SearchSalesforceIdModal';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';

interface SalesforceIdFieldProps {
  value: string;
  onChange: (value: string) => void;
  salesforceType: SfdcType | null;
  onTypeChange: (type: SfdcType) => void;
  isRequired?: boolean;
  label?: string;
  fieldId?: string;
}

interface SalesforceState {
  value: string;
  valid: boolean;
  validating: boolean;
  message: string;
  type: SfdcType | null;
}

const SalesforceIdField: React.FC<SalesforceIdFieldProps> = ({
  value,
  onChange,
  salesforceType,
  onTypeChange,
  isRequired = false,
  label = 'Salesforce ID',
  fieldId = 'salesforce-id'
}) => {
  const { sfdc_enabled } = useInterfaceConfig();
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [salesforceState, setSalesforceState] = useState<SalesforceState>({
    value: value || '',
    valid: false,
    validating: false,
    message: '',
    type: salesforceType
  });
  
  // Validate salesforce ID
  const validateSalesforceId = useCallback(async (id: string, type: SfdcType | null) => {
    if (!id.trim() || !type) {
      setSalesforceState(prev => ({ ...prev, valid: false, validating: false, message: '' }));
      return;
    }

    setSalesforceState(prev => ({ ...prev, validating: true }));
    
    try {
      const { valid, message } = await checkSalesforceId(id, apiFetch, type);
      setSalesforceState(prev => ({ 
        ...prev, 
        valid, 
        validating: false, 
        message: valid ? '' : message 
      }));
    } catch {
      setSalesforceState(prev => ({ 
        ...prev, 
        valid: false, 
        validating: false, 
        message: 'Error validating Salesforce ID' 
      }));
    }
  }, []);

  // Debounce the validation function
  const debouncedValidation = useDebounce(validateSalesforceId, 1000);

  // Update local state when props change
  useEffect(() => {
    setSalesforceState(prev => ({
      ...prev,
      value: value || '',
      type: salesforceType
    }));
  }, [value, salesforceType]);

  // Validate when value or type changes (debounced)
  useEffect(() => {
    if (salesforceState.value && salesforceState.type) {
      debouncedValidation(salesforceState.value, salesforceState.type);
    }
  }, [salesforceState.value, salesforceState.type, debouncedValidation]);

  const handleValueChange = (newValue: string) => {
    setSalesforceState(prev => ({ ...prev, value: newValue, valid: false }));
    onChange(newValue);
  };

  const handleTypeChange = (type: SfdcType) => {
    setSalesforceState(prev => ({ ...prev, type, valid: false }));
    onTypeChange(type);
  };

  const handleSearchResult = (selectedId: string, selectedType: SfdcType) => {
    handleValueChange(selectedId);
    if (selectedType !== salesforceState.type) {
      handleTypeChange(selectedType);
    }
    setIsSearchModalOpen(false);
  };

  const getValidationState = () => {
    if (salesforceState.validating) return 'default';
    if (!salesforceState.value) return 'default';
    return salesforceState.valid ? 'success' : 'error';
  };

  // Don't render if SFDC is not enabled
  if (!sfdc_enabled) {
    return null;
  }

  return (
    <>
      <FormGroup 
        label={label} 
        fieldId={fieldId}
        isRequired={isRequired}
      >
        {/* Radio buttons for type selection */}
        <div style={{ marginBottom: '12px' }}>
          <Split hasGutter>
            <SplitItem>
              <Radio
                isChecked={salesforceState.type === 'campaign'}
                name={`${fieldId}-type`}
                onChange={() => handleTypeChange('campaign')}
                label="Campaign"
                id={`${fieldId}-type-campaign`}
              />
            </SplitItem>
            <SplitItem>
              <Radio
                isChecked={salesforceState.type === 'opportunity'}
                name={`${fieldId}-type`}
                onChange={() => handleTypeChange('opportunity')}
                label="Opportunity"
                id={`${fieldId}-type-opportunity`}
              />
            </SplitItem>
            <SplitItem>
              <Radio
                isChecked={salesforceState.type === 'project'}
                name={`${fieldId}-type`}
                onChange={() => handleTypeChange('project')}
                label="Project"
                id={`${fieldId}-type-project`}
              />
            </SplitItem>
          </Split>
        </div>

        {/* Input field with search button */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <Button
            variant="secondary"
            icon={<SearchIcon />}
            onClick={() => setIsSearchModalOpen(true)}
            isDisabled={!salesforceState.type}
          >
            Id Finder
          </Button>
          
          <div style={{ flex: 1 }}>
            <TextInput
              id={fieldId}
              type="text"
              value={salesforceState.value}
              onChange={(_, newValue) => handleValueChange(newValue)}
              placeholder="Enter Salesforce ID"
              validated={getValidationState()}
              isDisabled={salesforceState.validating}
            />
          </div>
          
          <Tooltip
            content={<div>Salesforce Opportunity ID, Campaign ID or Project ID.</div>}
          >
            <OutlinedQuestionCircleIcon
              aria-label="Salesforce Opportunity ID, Campaign ID or Project ID."
              style={{ color: 'var(--pf-t--color--icon--secondary)', marginTop: '8px' }}
            />
          </Tooltip>
        </div>

        {/* Validation message */}
        {salesforceState.message && (
          <HelperText>
            <HelperTextItem variant="error">
              {salesforceState.message}
            </HelperTextItem>
          </HelperText>
        )}
        
        {salesforceState.validating && (
          <HelperText>
            <HelperTextItem>
              Validating Salesforce ID...
            </HelperTextItem>
          </HelperText>
        )}
        
        {salesforceState.valid && salesforceState.value && (
          <HelperText>
            <HelperTextItem variant="success">
              Valid Salesforce {salesforceState.type} ID
            </HelperTextItem>
          </HelperText>
        )}
      </FormGroup>

      {/* Search Modal */}
      <SearchSalesforceIdModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSubmitCb={handleSearchResult}
        defaultSfdcType={salesforceState.type}
      />
    </>
  );
};

export default SalesforceIdField;
