import React from 'react';
import { Label } from '@patternfly/react-core';
import type { OrderStatus } from './order-utils';

const COLORS: Record<OrderStatus['tone'], 'blue' | 'orange' | 'green' | 'red' | 'grey'> = {
  info: 'blue',
  warning: 'orange',
  success: 'green',
  danger: 'red',
  neutral: 'grey',
};

const OrderStatusLabel: React.FC<{ label: string; tone: OrderStatus['tone'] }> = ({ label, tone }) => (
  <Label color={COLORS[tone]} isCompact>
    {label}
  </Label>
);

export default OrderStatusLabel;
