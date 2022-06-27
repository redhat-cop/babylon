import * as React from 'react';

const MajorOutage = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} {...props}>
    <g transform="translate(-2 -2)">
      <circle cx={10} cy={10} r={10} transform="translate(2 2)" fill="#e74c3c" />
      <path
        d="M13.477 9.113 9.117 13.5a1 1 0 1 0 1.418 1.41l4.36-4.386a1 1 0 1 0-1.418-1.41Z"
        fill="#fff"
        fillRule="evenodd"
      />
      <path
        d="m9.084 10.5 4.358 4.377a1 1 0 0 0 1.418-1.411L10.5 9.09a1 1 0 1 0-1.417 1.41Z"
        fill="#fff"
        fillRule="evenodd"
      />
    </g>
  </svg>
);

export default MajorOutage;
