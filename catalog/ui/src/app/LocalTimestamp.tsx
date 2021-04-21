import * as React from 'react';

export interface LocalTimestampProps {
  timestamp: string;
}

const LocalTimestamp: React.FunctionComponent<LocalTimestampProps> = ({
  timestamp,
}) => {
  const ts = new Date(Date.parse(timestamp)).toLocaleString();
  return (
    <span>{ts}</span>
  );
}

export { LocalTimestamp };
