import React, { useEffect, useState } from 'react';
import { HelperText, HelperTextItem, TextInput } from '@patternfly/react-core';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';

import './service-alias-field.css';

export const SERVICE_ALIAS_MAX_LENGTH = 40;

/**
 * Edits the service alias, shown as a tag next to the service name in My Services.
 * Saves on Enter or blur; Escape reverts.
 */
const ServiceAliasField: React.FC<{
  value: string;
  onSave: (value: string) => Promise<unknown>;
}> = ({ value, onSave }) => {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (state !== 'saved') return undefined;
    const timeout = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timeout);
  }, [state]);

  async function save() {
    const trimmed = draft.trim();
    setDraft(trimmed);
    if (trimmed === value) return;
    try {
      await onSave(trimmed);
      setState('saved');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="service-alias-field">
      <div className="service-alias-field__control">
        <TextInput
          id="service-alias"
          aria-label="Service alias"
          aria-describedby="service-alias-helper"
          placeholder="e.g. ACME demo"
          maxLength={SERVICE_ALIAS_MAX_LENGTH}
          value={draft}
          onChange={(_event, v) => setDraft(v)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
            else if (event.key === 'Escape') setDraft(value);
          }}
        />
        {state === 'saved' ? (
          <span className="service-alias-field__saved" aria-live="polite">
            <CheckCircleIcon /> Saved
          </span>
        ) : null}
      </div>
      <HelperText id="service-alias-helper">
        {state === 'error' ? (
          <HelperTextItem variant="error">Couldn&apos;t save the alias, try again.</HelperTextItem>
        ) : (
          <HelperTextItem>Shown as a tag next to this service in My Services.</HelperTextItem>
        )}
      </HelperText>
    </div>
  );
};

export default ServiceAliasField;
