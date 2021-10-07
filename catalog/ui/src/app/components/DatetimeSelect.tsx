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
  current: Date;
  interval: number;
  maximum: Date;
  minimum: Date;
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
  const [scrolledIntoView, setScrolledIntoView] = React.useState(false);
  const currentInterval = interval * Math.round(Number(current) / interval);
  const currentItemId = `${idPrefix}${currentInterval}`;

  const dropdownItems: any[] = [];

  React.useEffect(() => {
    if (isOpen) {
      const elem = document.getElementById(currentItemId);
      if (elem && !scrolledIntoView) {
        elem.scrollIntoView({ block: "center" });
        setScrolledIntoView(true);
      }
    }
  })

  for (var t=Math.ceil(Number(minimum) / interval) * interval; t < Number(maximum); t += interval) {
    const isCurrent = t == currentInterval ? "rhpds-datetime-select-current" : null;
    const date = new Date(t);
    const dropdownItem = (
      <DropdownItem
        id={`${idPrefix}${t}`}
        className={isCurrent ? "rhpds-datetime-select-current" : ""}
        //TODO: boolean required but string is used
        isHovered={isCurrent}
        isPlainText={isCurrent}
        key={t}
      >{date.toLocaleString()}</DropdownItem>
    );
    dropdownItems.push(dropdownItem);
  }

  function toggleIsOpen(): void {
    setIsOpen(isOpen => {
      if (isOpen) {
        return false;
      } else {
        setScrolledIntoView(false);
        return true;
      }
    })
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
      dropdownItems={dropdownItems}
      autoFocus={false}
    />
  );
}

export { DatetimeSelect };
