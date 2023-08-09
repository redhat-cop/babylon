import React, { useCallback, useState } from 'react';
import { NumberInput } from '@patternfly/react-core';

/* PatientNumberInput which aggregates consecutive changes into single events (throttle) */
const PatientNumberInput: React.FC<
  {
    min?: number;
    max?: number;
    onChange?: (value: number) => void;
    onChangeDelay?: number;
    value: number;
  } & Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>
> = ({ min, max, onChange, onChangeDelay, value, ...rest }) => {
  const [state, setState] = useState<{
    timeout?: string | number | NodeJS.Timeout;
    value: number;
  }>({ value: value });

  const onValueChange = useCallback(
    (newValue: number) => {
      const validatedValue =
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
    },
    [max, min, onChange, onChangeDelay],
  );

  return (
    <NumberInput
      min={min}
      max={max}
      onChange={(event: React.FormEvent<HTMLInputElement>) => {
        const value = parseInt(event.currentTarget.value);
        if (!isNaN(value)) {
          onValueChange(value);
        }
      }}
      onMinus={() => onValueChange(state.value - 1)}
      onPlus={() => onValueChange(state.value + 1)}
      value={state.value}
      {...rest}
    />
  );
};

export default PatientNumberInput;
