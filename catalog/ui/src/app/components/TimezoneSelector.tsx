import React from 'react';
import GlobeIcon from '@patternfly/react-icons/dist/js/icons/globe-americas-icon';
import { COMMON_TIMEZONES } from './timezones';

import './date-time-picker.css';

const TimezoneSelector: React.FC<{
  timezone: string;
  onChange: (timezone: string) => void;
  isDisabled?: boolean;
}> = ({ timezone, onChange, isDisabled = false }) => (
  <div className="date-time-picker__timezone">
    <GlobeIcon className="date-time-picker__timezone-icon" />
    <select
      aria-label="Timezone"
      value={timezone}
      onChange={(e) => onChange(e.target.value)}
      className="date-time-picker__timezone-native-select"
      disabled={isDisabled}
    >
      {COMMON_TIMEZONES.map((tz) => (
        <option key={tz.value} value={tz.value}>{tz.label}</option>
      ))}
    </select>
  </div>
);

export default TimezoneSelector;
