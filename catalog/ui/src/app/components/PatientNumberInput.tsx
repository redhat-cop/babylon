/* NumberInput which aggregates consecutive changes into single events */

import React, { useEffect, useState } from 'react';
import { NumberInput } from '@patternfly/react-core';

const PatientNumberInput: React.FC<{
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  onChangeDelay?: number;
  value: number;
}> = ({ min, max, onChange, onChangeDelay, value }) => {
  const [state, setState] = useState<{
    timeout?: any;
    value: number;
  }>({ value: value });

  function onValueChange(newValue: number) {
    const validatedValue: number =
      min !== undefined && newValue < min ? min : max !== undefined && newValue > max ? max : newValue;
    setState((prevState) => {
      if (prevState.timeout) {
        clearTimeout(prevState.timeout);
      }
      return {
        timeout: setTimeout(onChange, onChangeDelay || 1000, validatedValue),
        value: validatedValue,
      };
    });
  }

  // Handle controlling component value change
  useEffect(() => {
    onValueChange(value);
  }, [value]);

  return (
    <NumberInput
      min={min}
      max={max}
      onChange={(event: any) => {
        if (!isNaN(event.target.value)) {
          onValueChange(parseInt(event.target.value));
        }
      }}
      onMinus={() => onValueChange(state.value - 1)}
      onPlus={() => onValueChange(state.value + 1)}
      value={state.value}
    />
  );
};

export default PatientNumberInput;
