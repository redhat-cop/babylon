import React from 'react';
import LocalTimestamp from '@app/components/LocalTimestamp';

/** An API timestamp in local time, or the raw text for relative values such as "3d after provisioning starts". */
const OrderTime: React.FC<{ value?: string | null }> = ({ value }) => {
  if (!value) return <>-</>;
  if (Number.isNaN(Date.parse(value))) return <>{value}</>;
  return <LocalTimestamp timestamp={value} variant="short" />;
};

export default OrderTime;
