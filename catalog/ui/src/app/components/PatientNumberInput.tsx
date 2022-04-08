/* NumberInput which aggregates consecutive changes into single events */

import React from "react";
import { useEffect, useState } from "react";
import { NumberInput } from '@patternfly/react-core';

interface PatientNumberInputProps {
  className?: string;
  isDisabled?: boolean;
  min?: number;
  max?: number;
  onChange?: (value:number) => void;
  onChangeDelay?: number;
  value: number;
}

interface PatientNumberInputState {
  timeout?: any;
  value: number;
}

const PatientNumberInput: React.FunctionComponent<PatientNumberInputProps> = ({
  className, isDisabled, min, max, onChange, onChangeDelay, value,
}) => {
  const [state, setState] = useState<PatientNumberInputState>({value: value});

  function onValueChange(newValue:number) {
    const validatedValue:number = (
      (min !== undefined && newValue < min) ? min :
      (max !== undefined && newValue > max) ? max :
      newValue
    );
    setState((prevState) => {
      if (prevState.timeout) {
        clearTimeout(prevState.timeout)
      }
      return {
        timeout: setTimeout(onChange, onChangeDelay || 1000, validatedValue),
        value: validatedValue,
      };
    })
  }

  // Handle controlling component value change
  useEffect(() => {
    onValueChange(value);
  }, [value]);

  return (
    <NumberInput
      min={min}
      max={max}
      onChange={(event:any) => {
        if (!isNaN(event.target.value)) {
          onValueChange(parseInt(event.target.value));
        }
      }}
      onMinus={() => onValueChange(state.value - 1)}
      onPlus={() => onValueChange(state.value + 1)}
      value={state.value}
    />
  );
}

export default PatientNumberInput;
