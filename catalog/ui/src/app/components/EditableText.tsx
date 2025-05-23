import React, { useState } from 'react';
import { Button, Spinner, Text, TextArea, TextInput, TextVariants } from '@patternfly/react-core';
import PencilAltIcon from '@patternfly/react-icons/dist/js/icons/pencil-alt-icon';

import './editable-text.css';

const EditableText: React.FC<{
  ['aria-label']?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  componentType?: 'Password' | 'TextArea' | 'TextInput';
  updating?: boolean;
  value: string;
  isLocked?: boolean;
}> = ({ 'aria-label': ariaLabel, componentType, onChange, placeholder, updating, value, isLocked = false }) => {
  const [editing, setEditing] = useState(false);
  const [editedValue, setEditedValue] = useState(value || '');

  function abortEditing(): void {
    setEditedValue(value);
    setEditing(false);
  }

  function beginEditing(): void {
    setEditedValue(value);
    if (!updating) {
      setEditing(true);
    }
  }

  function finishEditing(): void {
    onChange(editedValue ? editedValue.trim() : '');
    setEditing(false);
  }

  function onKeyUp(event: any): void {
    if (event.key === 'Enter') {
      finishEditing();
    } else if (event.key === 'Escape') {
      abortEditing();
    }
  }

  if (editing) {
    if (componentType === 'TextArea') {
      return (
        <TextArea
          autoFocus
          aria-label={ariaLabel}
          className="editable-text-area"
          onBlur={() => finishEditing()}
          onChange={(_event, v) => setEditedValue(v)}
          onKeyUp={onKeyUp}
          value={editedValue}
          isDisabled={isLocked}
        />
      );
    }
    return (
      <TextInput
        autoFocus
        aria-label={ariaLabel}
        className="editable-text-input"
        onBlur={() => finishEditing()}
        onChange={(_event, v) => setEditedValue(v)}
        onKeyUp={onKeyUp}
        value={editedValue}
        isDisabled={isLocked}
      />
    );
  }
  if (componentType === 'Password') {
    return (
      <Text
        component={TextVariants.p}
        className={value ? 'editable-text-value' : 'editable-text-placeholder'}
        onClick={beginEditing}
      >
        {value ? '********' : '- none -'}
        <Button onClick={beginEditing} variant="link" icon={updating ? <Spinner size="sm" /> : <PencilAltIcon />} />
      </Text>
    );
  }
  return (
    <Text
      component={TextVariants.p}
      className={value ? 'editable-text-value' : 'editable-text-placeholder'}
      onClick={beginEditing}
    >
      {value || placeholder || ''}
      <Button onClick={beginEditing} variant="link" icon={updating ? <Spinner size="sm" /> : <PencilAltIcon />} />
    </Text>
  );
};

export default EditableText;
