import React from 'react';
import parseDuration from 'parse-duration';

function parseAsUTC(dateString: string): Date {
  // Check if string contains a timezone (Z or ±hh:mm at the end)
  const hasTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(dateString);

  if (hasTimezone) {
    return new Date(dateString);
  }

  // Trim microseconds (if more than 3 digits) to milliseconds
  const normalized = dateString.replace(/\.(\d{3})\d*/, (_, ms: string) => `.${ms}`);

  // Append 'Z' to treat the string as UTC
  return new Date(normalized + 'Z');
}

const TimeInterval: React.FC<{
  interval?: number | string;
  toDate?: Date;
  toEpochMilliseconds?: number;
  toTimestamp?: string;
}> = ({ interval, toDate, toEpochMilliseconds, toTimestamp }) => {
  const to: number | null = toDate
    ? toDate.getTime()
    : toTimestamp
      ? parseAsUTC(toTimestamp).getTime()
      : toEpochMilliseconds
        ? toEpochMilliseconds
        : null;
  const intervalMilliseconds: number | null = to
    ? to - Date.now()
    : typeof interval === 'string'
      ? parseDuration(interval)
      : typeof interval === 'number'
        ? interval * 1000
        : null;

  console.assert(intervalMilliseconds !== null, 'No target time provided to TimeInterval');

  const relativeText = to ? (intervalMilliseconds < 0 ? ' ago' : ' from now') : null;
  const abs_seconds = Math.abs(intervalMilliseconds / 1000);

  if (abs_seconds > 49 * 60 * 60) {
    return (
      <span>
        {Math.round(abs_seconds / 24 / 60 / 60)} days{relativeText}
      </span>
    );
  } else if (abs_seconds > 120 * 60) {
    return (
      <span>
        {Math.round(abs_seconds / 60 / 60)} hours{relativeText}
      </span>
    );
  } else if (abs_seconds > 200) {
    return (
      <span>
        {Math.round(abs_seconds / 60)} minutes{relativeText}
      </span>
    );
  } else {
    return (
      <span>
        {Math.round(abs_seconds)} seconds{relativeText}
      </span>
    );
  }
};

export default TimeInterval;
