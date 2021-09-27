import * as React from 'react';

export interface LocalTimestampProps {
  time?: number;
  timestamp?: any;
}

const LocalTimestamp: React.FunctionComponent<LocalTimestampProps> = ({
  time,
  timestamp,
}) => {
  const ts = new Date(time ? time : Date.parse(timestamp)).toLocaleString();
  return (
    <span>{ts}</span>
  );
}

export { LocalTimestamp };
