import * as React from 'react';

export interface TimeIntervalProps {
  interval: number;
  to: string;
}

const TimeInterval: React.FunctionComponent<TimeIntervalProps> = ({
  interval,
  to,
}) => {
  if (to) {
    interval = (Date.parse(to) - Date.now()) / 1000;
  }

  if (interval > 49 * 60 * 60) {
    return (<span>{ Math.round(interval / 24 / 60 / 60) } days</span>);
  } else if(interval > 120 * 60) {
    return (<span>{ Math.round(interval / 60 / 60) } hours</span>);
  } else if(interval > 200) {
    return (<span>{ Math.round(interval / 60) } minutes</span>);
  } else {
    return (<span>{ Math.round(interval) } seconds</span>);
  }
  const ts = new Date(Date.parse(timestamp)).toLocaleString();
  return (
    <span>{ts}</span>
  );
}

export { TimeInterval };
