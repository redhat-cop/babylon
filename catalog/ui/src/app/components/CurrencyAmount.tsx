import React from 'react';

const CurrencyAmount: React.FC<{ amount: number }> = ({ amount }) => {
  const _amount = (Math.ceil(amount * 100) / 100).toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
  return <span>$ {_amount}</span>;
};

export default CurrencyAmount;
