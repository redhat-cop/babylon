import React from "react";
import { useState } from "react";

import { SearchInput } from '@patternfly/react-core';

export interface KeywordSearchInputProps {
  initialValue?: string[];
  placeholder?: string;
  onSearch: (keywords:string[]) => void;
}

const KeywordSearchInput: React.FunctionComponent<KeywordSearchInputProps> = ({
  initialValue,
  placeholder,
  onSearch,
}) => {
  const [value, setValue] = useState(initialValue ? initialValue.join(' ') : '');

  return (
    <SearchInput
      value={value}
      aria-label="Search"
      placeholder={placeholder}
      onChange={(v) => setValue(v)}
      onSearch={() => {
        const trimmedValue = value.trim();
        if (trimmedValue === '') {
          onSearch(null);
        } else {
          onSearch(value.trim().split(/ +/));
        }
      }}
    />
  );
}

export default KeywordSearchInput;
