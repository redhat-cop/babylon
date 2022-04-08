import React from 'react';
import { useState } from "react";

import {
  Button,
  Spinner,
  Text,
  TextArea,
  TextInput,
  TextVariants,
} from '@patternfly/react-core';

import { PencilAltIcon } from '@patternfly/react-icons';

import './editable-text.css';

export interface EditableTextProps {
  ['aria-label']?: string;
  onChange: (value:string) => void;
  placeholder?: string;
  componentType?: 'Password'|'TextArea'|'TextInput';
  updating?: boolean;
  value: string;
}

const EditableText: React.FunctionComponent<EditableTextProps> = ({
  'aria-label': ariaLabel,
  componentType,
  onChange,
  placeholder,
  updating,
  value
}) => {
  const [editing, setEditing] = useState<boolean>(false);
  const [editedValue, setEditedValue] = useState<string>(value);

  function abortEditing (): void {
    setEditedValue(value);
    setEditing(false);
  }

  function beginEditing (): void {
    setEditedValue(value);
    if (!updating) {
      setEditing(true);
    }
  }

  function finishEditing (): void {
    onChange(editedValue.trim());
    setEditing(false);
  }

  function onKeyUp (event:any): void {
    if (event.key === 'Enter') {
      finishEditing();
    } else if(event.key === 'Escape') {
      abortEditing();
    }
  }

  if (editing) {
    if (componentType === 'TextArea') {
      return (
        <TextArea autoFocus
          aria-label={ariaLabel}
          className="editable-text-area"
          onBlur={() => finishEditing()}
          onChange={(v) => setEditedValue(v)}
          onKeyUp={onKeyUp}
          value={editedValue}
        />
      );
    } else {
      return (
        <TextInput autoFocus
          aria-label={ariaLabel}
          className="editable-text-input"
          onBlur={() => finishEditing()}
          onChange={(v) => setEditedValue(v)}
          onKeyUp={onKeyUp}
          value={editedValue}
        />
      );
    }
  } else {
    if (componentType === 'Password') {
      return (
        <Text
          component={TextVariants.p}
          className={value ? 'editable-text-value' : 'editable-text-placeholder'}
          onClick={beginEditing}
        >
          {value ? '********' : '- none -'}
          <Button onClick={beginEditing} variant="link" icon={updating ? <Spinner size="sm"/> : <PencilAltIcon/>}/>
       </Text>
      )
    } else {
      return (
        <Text
          component={TextVariants.p}
          className={value ? 'editable-text-value' : 'editable-text-placeholder'}
          onClick={beginEditing}
        >
          {value || placeholder || ''}
          <Button onClick={beginEditing} variant="link" icon={updating ? <Spinner size="sm"/> : <PencilAltIcon/>}/>
        </Text>
      )
    }
  }
}

export default EditableText;
