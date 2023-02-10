import React, { useEffect, useState } from 'react';
import { SearchInput } from '@patternfly/react-core';

const SearchInputString: React.FC<
  {
    initialValue?: string;
    placeholder?: string;
    onSearch: (value: string) => void;
    setValueCb?: (cb: (v: string) => void) => void;
  } & React.HTMLAttributes<HTMLInputElement>
> = ({ initialValue, placeholder, onSearch, setValueCb, ...rest }) => {
  const [value, setValue] = useState(initialValue || '');

  // sync callback with parent
  useEffect(() => {
    setValueCb && setValueCb(() => setValue);
  }, [setValue]);

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
          onSearch(trimmedValue);
        }
      }}
    />
  );
};

export default SearchInputString;
