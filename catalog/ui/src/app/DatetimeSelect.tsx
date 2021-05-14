import * as React from 'react';
import './datetime-select.css';

import {
  Dropdown,
  DropdownItem,
  DropdownToggle,
} from '@patternfly/react-core';

import {
  OutlinedClockIcon,
} from '@patternfly/react-icons';

export interface DatetimeSelectProps {
  idPrefix: string;
  current: number;
  interval: number;
  maximum: number;
  minimum: number;
  onSelect: any;
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
  const currentInterval = interval * Math.round(current / interval);
  const currentItemId = `${idPrefix}${currentInterval}`;

  const dropdownItems = [];

  React.useEffect(() => {
    if (isOpen) {
      const elem = document.getElementById(currentItemId);
      if (elem) {
        elem.scrollIntoView({ block: "center" });
      }
    }
  })

  for (var t=Math.floor(minimum / interval) * interval; t < maximum; t += interval) {
    const isCurrent = t == currentInterval ? "rhpds-datetime-select-current" : null;
    const date = new Date(t);
    const dropdownItem = (
      <DropdownItem
        id={`${idPrefix}${t}`}
        className={isCurrent ? "rhpds-datetime-select-current" : null}
        isHovered={isCurrent}
        isPlainText={isCurrent}
        key={t}
      >{date.toLocaleString()}</DropdownItem>
    );
    dropdownItems.push(dropdownItem);
  }

  function toggleIsOpen(): void {
    setIsOpen(isOpen => !isOpen)
  }

  function _onSelect(event): void {
    const target = event.target;
    const idParts = target.parentNode.id.split(":");
    const time = parseInt(idParts[idParts.length - 1]);
    onSelect(time);
    setIsOpen(false);
  }

  return (
    <Dropdown
      className="rhpds-datetimeselect-dropdown"
      onSelect={_onSelect}
      toggle={
        <DropdownToggle
          className="rhpds-datetimeselect-toggle"
          onToggle={toggleIsOpen}
          toggleIndicator={OutlinedClockIcon}
        >{toggleContent}</DropdownToggle>
      }
      isOpen={isOpen}
      isPlain={true}
      dropdownItems={dropdownItems}
      autoFocus={false}
    />
  );
}

export { DatetimeSelect };
