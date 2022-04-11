import React from 'react';
import './datetime-select.css';

import { Dropdown, DropdownItem, DropdownToggle } from '@patternfly/react-core';

import { OutlinedClockIcon } from '@patternfly/react-icons';

export interface DatetimeSelectProps {
  idPrefix: string;
  current: Date;
  interval: number;
  maximum: Date;
  minimum: Date;
  onSelect: (date: Date) => void;
  toggleContent: any;
}

const DatetimeSelect: React.FunctionComponent<DatetimeSelectProps> = ({
  idPrefix,
  current,
  interval,
  maximum,
  minimum,
  onSelect,
  toggleContent,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [scrolledIntoView, setScrolledIntoView] = React.useState(false);
  const currentInterval = interval * Math.round(current.getTime() / interval);
  const currentItemId = `${idPrefix}${currentInterval}`;

  const dropdownItems: any[] = [];

  React.useEffect(() => {
    if (isOpen) {
      const elem = document.getElementById(currentItemId);
      if (elem && !scrolledIntoView) {
        elem.scrollIntoView({ block: 'center' });
        setScrolledIntoView(true);
      }
    }
  });

  for (var t = Math.ceil(minimum.getTime() / interval) * interval; t < maximum.getTime(); t += interval) {
    //TODO: boolean required but string is used
    const isCurrent: any = t == currentInterval ? 'datetime-select-current' : null;
    const date = new Date(t);
    const dropdownItem = (
      <DropdownItem
        id={`${idPrefix}${t}`}
        className={isCurrent ? 'datetime-select-current' : ''}
        isHovered={isCurrent}
        isPlainText={isCurrent}
        key={t}
        onClick={() => {
          onSelect(date);
          setIsOpen(false);
        }}
      >
        {date.toLocaleString()}
      </DropdownItem>
    );
    dropdownItems.push(dropdownItem);
  }

  function toggleIsOpen(): void {
    setIsOpen((isOpen) => {
      if (isOpen) {
        return false;
      } else {
        setScrolledIntoView(false);
        return true;
      }
    });
  }

  return (
    <Dropdown
      className="datetimeselect-dropdown"
      toggle={
        <DropdownToggle className="datetimeselect-toggle" onToggle={toggleIsOpen} toggleIndicator={OutlinedClockIcon}>
          {toggleContent}
        </DropdownToggle>
      }
      isOpen={isOpen}
      dropdownItems={dropdownItems}
      autoFocus={false}
    />
  );
};

export default DatetimeSelect;
