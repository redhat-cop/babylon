import * as React from 'react';

import {
  Checkbox,
  NumberInput,
  Select,
  SelectOption,
  SelectVariant,
  TextInput
} from '@patternfly/react-core';

export interface DynamicFormInputProps {
  parameter: any;
  value?: any;
  isDisabled?: boolean;
  onChange: any;
}

const DynamicFormInput: React.FunctionComponent<DynamicFormInputProps> = ({
  parameter,
  value,
  isDisabled,
  onChange,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  if (parameter.openAPIV3Schema?.enum) {
    return (
      <Select
        aria-label={parameter.description}
        isDisabled={isDisabled}
        isOpen={isOpen}
        onSelect={(event, value) => {onChange(value); setIsOpen(false)}}
        onToggle={() => setIsOpen((v) => !v)}
        selections={value}
        variant={SelectVariant.single}
      >
        {parameter.openAPIV3Schema.enum.map((enumValue) => (
          <SelectOption
            key={enumValue}
            value={enumValue}
          />
        )) }
      </Select>
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
        //TODO: value does not exist
        onChange={(event) => onChange(isNaN(event.target.value) ? value : Number(event.target.value))}
        onMinus={() => onChange(value - 1)}
        onPlus={() => onChange(value + 1)}
        value={value || 0}
      />
    );
  } else {
    const validationRegExp = parameter.openAPIV3Schema?.pattern ? new RegExp(parameter.openAPIV3Schema.pattern) : null;
    const validationResult = validationRegExp ? validationRegExp.test(value) : null;
    const validated = validationResult ? 'success' : validationResult === false ? 'error' : 'default';
    return (
      <TextInput type="text"
        key={parameter.name}
        id={parameter.name}
        isDisabled={isDisabled}
        onChange={(v) => onChange(v, validationRegExp ? validationRegExp.test(v): null)}
        value={value || ''}
        validated={validated}
      />
    );
  }
}

export { DynamicFormInput };
