import React from 'react';

import { Checkbox, NumberInput, Select, SelectOption, SelectVariant, TextInput } from '@patternfly/react-core';

export interface DynamicFormInputProps {
  id?: string;
  isDisabled?: boolean;
  onChange: any;
  parameter: any;
  validationResult?: boolean;
  value?: any;
}

const DynamicFormInput: React.FunctionComponent<DynamicFormInputProps> = ({
  id,
  isDisabled,
  onChange,
  parameter,
  validationResult,
  value,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  if (parameter.openAPIV3Schema?.enum) {
    return (
      <div style={{ cursor: isDisabled ? 'not-allowed' : 'default' }} className="select-wrapper">
        <Select
          aria-label={parameter.description}
          isDisabled={isDisabled}
          isOpen={isOpen}
          onSelect={(event, value) => {
            onChange(value);
            setIsOpen(false);
          }}
          onToggle={() => setIsOpen((v) => !v)}
          placeholderText={parameter.placeholderText || `- Select ${parameter.formLabel || parameter.name} -`}
          selections={value}
          variant={SelectVariant.single}
        >
          {parameter.openAPIV3Schema.enum.map((enumValue) => (
            <SelectOption key={enumValue} value={enumValue} />
          ))}
        </Select>
      </div>
    );
  } else if (parameter.openAPIV3Schema?.type === 'boolean') {
    return (
      <Checkbox
        key={parameter.name}
        id={parameter.name}
        name={parameter.name}
        label={parameter.formLabel || parameter.name}
        isChecked={value}
        isDisabled={isDisabled}
        onChange={(checked) => onChange(checked)}
      />
    );
  } else if (parameter.openAPIV3Schema?.type === 'integer') {
    return (
      <NumberInput
        key={parameter.name}
        id={parameter.name}
        isDisabled={isDisabled}
        min={parameter.openAPIV3Schema.minmum || 0}
        max={parameter.openAPIV3Schema.maximum}
        // TODO: value does not exist
        onChange={(event: any) => {
          const n = isNaN(event.target.value) ? parameter.openAPIV3Schema.default : parseInt(event.target.value);
          onChange(
            n < parameter.openAPIV3Schema.minimum
              ? parameter.openAPIV3Schema.minimum
              : n > parameter.openAPIV3Schema.maximum
              ? parameter.openAPIV3Schema.maximum
              : n
          );
        }}
        onMinus={() => onChange(parseInt(value) - 1)}
        onPlus={() => onChange(parseInt(value) + 1)}
        value={value || 0}
      />
    );
  } else {
    const validationRegExp = parameter.openAPIV3Schema?.pattern ? new RegExp(parameter.openAPIV3Schema.pattern) : null;
    const textValidationResult =
      validationResult !== undefined ? validationResult : validationRegExp ? validationRegExp.test(value) : null;
    const validated =
      value === undefined || (!parameter.required && value === '')
        ? 'default'
        : textValidationResult
        ? 'success'
        : textValidationResult === false
        ? 'error'
        : 'default';
    return (
      <TextInput
        type="text"
        key={parameter.name}
        id={id}
        isDisabled={isDisabled}
        onChange={(v) => onChange(v, validationRegExp ? validationRegExp.test(v) : null)}
        value={value || ''}
        validated={validated}
      />
    );
  }
};

export default DynamicFormInput;
