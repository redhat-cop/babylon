import * as React from 'react';

const DegradedPerformance = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" {...props}>
    <g transform="translate(-2 -2)">
      <circle cx={10} cy={10} r={10} transform="translate(2 2)" fill="#f1c40f" />
      <rect width={8} height={2} rx={1} transform="translate(8 11)" fill="#fff" />
    </g>
  </svg>
);

export default DegradedPerformance;
