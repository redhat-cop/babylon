import React, { useState } from 'react';
import { SearchInput } from '@patternfly/react-core';

const KeywordSearchInput: React.FC<
  {
    initialValue?: string;
    placeholder?: string;
    onSearch: (keywords: string) => void;
  } & React.HTMLAttributes<HTMLInputElement>
> = ({ initialValue, placeholder, onSearch, ...rest }) => {
  const [value, setValue] = useState(initialValue || '');

  return (
    <SearchInput
      {...rest}
      value={value}
      aria-label="Search"
      placeholder={placeholder}
      onChange={(e, v) => setValue(v)}
      onClear={() => {
        setValue('');
        onSearch(null);
      }}
      onSearch={() => {
        const trimmedValue = value.trim();
        if (trimmedValue === '') {
          onSearch(null);
        } else {
          onSearch(value.trim());
        }
      }}
    />
  );
};

export default KeywordSearchInput;
