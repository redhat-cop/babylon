import * as React from 'react';

function getLang() {
  if (navigator.languages != undefined) return navigator.languages[0];
  return navigator.language || 'en-US';
}

const LocalTimestamp: React.FC<{
  date?: Date;
  time?: number;
  timestamp?: string;
  variant?: 'short' | 'long';
  includeTimezone?: boolean;
}> = ({ date, time, timestamp, variant = 'long', includeTimezone = true }) => {
  const ts = (date || new Date(time ? time : Date.parse(timestamp))).toLocaleDateString([getLang(), 'en-US'], {
    ...(variant === 'short' ? { year: '2-digit' } : { year: 'numeric' }),
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeTimezone ? { timeZoneName: 'short' } : {}),
  });
  return <span>{ts}</span>;
};

export default LocalTimestamp;
