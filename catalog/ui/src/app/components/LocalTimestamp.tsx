import React from 'react';
import { getLang } from '@app/util';

const LocalTimestamp: React.FC<
  {
    date?: Date;
    time?: number;
    timestamp?: string;
    variant?: 'short' | 'long';
    includeTimezone?: boolean;
  } & React.HTMLAttributes<HTMLSpanElement>
> = ({ date, time, timestamp, variant = 'long', includeTimezone = true, ...props }) => {
  const ts = (date || new Date(time ? time : Date.parse(timestamp))).toLocaleDateString([getLang(), 'en-US'], {
    ...(variant === 'short' ? { year: '2-digit' } : { year: 'numeric' }),
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeTimezone ? { timeZoneName: 'short' } : {}),
  });
  return <span {...props}>{ts}</span>;
};

export default LocalTimestamp;
