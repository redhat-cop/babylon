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
  const d = date || new Date(time ? time : Date.parse(timestamp));
  let ts: string;
  if (variant === 'short') {
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    const timeStr = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...(includeTimezone ? { timeZoneName: 'short' } : {}),
    });
    ts = `${weekday}, ${month} ${day} · ${timeStr}`;
  } else {
    ts = d.toLocaleDateString([getLang(), 'en-US'], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      ...(includeTimezone ? { timeZoneName: 'short' } : {}),
    });
  }
  return <span {...props}>{ts}</span>;
};

export default LocalTimestamp;
