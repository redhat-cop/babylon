import * as React from 'react';

const Operational = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} {...props}>
    <g transform="translate(-2 -2)">
      <circle cx={10} cy={10} r={10} transform="translate(2 2)" fill="#2fcc66" />
      <path
        d="M9.707 11.293a1 1 0 1 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4a1 1 0 1 0-1.414-1.414L11 12.586Z"
        fill="#fff"
      />
    </g>
  </svg>
);

export default Operational;
