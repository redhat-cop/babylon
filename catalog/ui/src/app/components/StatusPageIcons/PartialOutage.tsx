import * as React from 'react';

const PartialOutage = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} {...props}>
    <g transform="translate(-2 -2)">
      <circle cx={10} cy={10} r={10} transform="translate(2 2)" fill="#e67e22" />
      <path
        d="M12 14a1 1 0 0 1-1-1V8a1 1 0 0 1 2 0v5a1 1 0 0 1-1 1m0 3a1 1 0 1 1 1-1 1 1 0 0 1-1 1"
        fill="#fff"
        fillRule="evenodd"
      />
    </g>
  </svg>
);

export default PartialOutage;
