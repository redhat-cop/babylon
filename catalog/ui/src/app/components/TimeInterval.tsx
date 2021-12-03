import * as React from 'react';

const parseDuration = require('parse-duration');

export interface TimeIntervalProps {
  interval?: number;
  timeOnly?: boolean;
  to?: string | number;
}

const TimeInterval: React.FunctionComponent<TimeIntervalProps> = ({
  interval,
  timeOnly,
  to,
}) => {
  const seconds = (
    to ? (("string" === typeof to ? Date.parse(to) : to) - Date.now()) / 1000 :
    typeof(interval) === 'number' ? interval :
    parseDuration(interval) / 1000
  );
  const relativeText = to && !timeOnly ? ( seconds < 0 ? " ago" : " from now") : null;
  const abs_seconds = Math.abs(seconds)

  if (abs_seconds > 49 * 60 * 60) {
    return (<span>{ Math.round(abs_seconds / 24 / 60 / 60) } days{relativeText}</span>);
  } else if(abs_seconds > 120 * 60) {
    return (<span>{ Math.round(abs_seconds / 60 / 60) } hours{relativeText}</span>);
  } else if(abs_seconds > 200) {
    return (<span>{ Math.round(abs_seconds / 60) } minutes{relativeText}</span>);
  } else {
    return (<span>{ Math.round(abs_seconds) } seconds{relativeText}</span>);
  }
}

export { TimeInterval };
