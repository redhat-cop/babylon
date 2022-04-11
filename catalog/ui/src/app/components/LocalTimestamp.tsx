import * as React from 'react';

export interface LocalTimestampProps {
  date?: Date;
  time?: number;
  timestamp?: string;
}

const LocalTimestamp: React.FunctionComponent<LocalTimestampProps> = ({ date, time, timestamp }) => {
  const ts = (date || new Date(time ? time : Date.parse(timestamp))).toLocaleString();
  return <span>{ts}</span>;
};

export default LocalTimestamp;
