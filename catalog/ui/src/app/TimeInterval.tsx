import * as React from 'react';

export interface TimeIntervalProps {
  interval: any;
}

const TimeInterval: React.FunctionComponent<TimeIntervalProps> = ({
  interval,
}) => {
  if (interval > 2 * 24 * 60 * 60) {
    return (<span>{ Math.floor(interval / 24 / 60 / 60) } days</span>);
  } else if(interval > 2 * 60 * 60) {
    return (<span>{ Math.floor(interval / 60 / 60) } hours</span>);
  } else if(interval > 2 * 60) {
    return (<span>{ Math.floor(interval / 60) } minutes</span>);
  } else {
    return (<span>{ interval } seconds</span>);
  }
  const ts = new Date(Date.parse(timestamp)).toLocaleString();
  return (
    <span>{ts}</span>
  );
}

export { TimeInterval };
