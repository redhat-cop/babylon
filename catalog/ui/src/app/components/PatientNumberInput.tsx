import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { HelperText, HelperTextItem, NumberInput } from '@patternfly/react-core';
import useSession from '@app/utils/useSession';

/* PatientNumberInput which aggregates consecutive changes into single events (throttle) */
const PatientNumberInput: React.FC<
  {
    min?: number;
    max?: number;
    onChange?: (value: number) => void;
    onChangeDelay?: number;
    value: number;
    adminModifier?: boolean;
    rejectOutOfRange?: boolean;
    isDisabled?: boolean;
    inputAriaLabel?: string;
  } & Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>
> = ({
  min,
  max,
  onChange,
  onChangeDelay,
  value,
  adminModifier = false,
  rejectOutOfRange = false,
  isDisabled = false,
  inputAriaLabel,
  ...rest
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [error, setError] = useState<string>();
  const errorId = useId();
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { isAdmin } = useSession().getSession();
  const _max = useMemo(() => (adminModifier && isAdmin ? 999 : max), [isAdmin, max, adminModifier]);

  useEffect(() => {
    setInputValue(value);
    setError(undefined);
    return () => clearTimeout(timeout.current);
  }, [value, min, _max, isDisabled]);

  const onValueChange = useCallback(
    (newValue: number) => {
      clearTimeout(timeout.current);
      if (isDisabled) return;
      if (
        rejectOutOfRange &&
        (!Number.isInteger(newValue) ||
          (min !== undefined && newValue < min) ||
          (_max !== undefined && newValue > _max))
      ) {
        setInputValue(value);
        setError(
          `Enter a whole number${min !== undefined ? ` of at least ${min}` : ''}${_max !== undefined ? ` and no more than ${_max}` : ''}. The change was not saved.`,
        );
        return;
      }
      if (!Number.isFinite(newValue)) return;
      const validatedValue =
        min !== undefined && newValue < min ? min : _max !== undefined && newValue > _max ? _max : newValue;
      setError(undefined);
      setInputValue(validatedValue);
      timeout.current = setTimeout(() => onChange?.(validatedValue), onChangeDelay ?? 1000);
    },
    [_max, min, onChange, onChangeDelay, rejectOutOfRange, isDisabled, value],
  );

  return (
    <>
      <NumberInput
        min={min}
        max={_max}
        isDisabled={isDisabled}
        inputAriaLabel={inputAriaLabel}
        validated={error ? 'error' : 'default'}
        inputProps={{ 'aria-describedby': error ? errorId : undefined }}
        onChange={(event: React.FormEvent<HTMLInputElement>) => {
          if (rejectOutOfRange && error && event.type === 'blur') return;
          const text = event.currentTarget.value;
          onValueChange(rejectOutOfRange ? (text.trim() ? Number(text) : NaN) : parseInt(text));
        }}
        onMinus={() => onValueChange(inputValue - 1)}
        onPlus={() => onValueChange(inputValue + 1)}
        value={inputValue}
        {...rest}
      />
      {error ? (
        <HelperText>
          <HelperTextItem id={errorId} variant="error" role="alert">
            {error}
          </HelperTextItem>
        </HelperText>
      ) : null}
    </>
  );
};

export default PatientNumberInput;
