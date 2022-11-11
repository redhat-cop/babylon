import React from 'react';

const EnterprisePremiumIcon: React.FC<React.HTMLAttributes<HTMLOrSVGElement> & { fill?: string }> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="24.382 16.489 7.258 13.14" {...props}>
    <path
      d="M31.62 20.11c0-2-1.63-3.62-3.62-3.62-3.13-.07-4.82 3.93-2.62 6.11V29c0 .25.15.48.39.58.23.1.5.04.68-.13l1.56-1.56 1.56 1.56c.18.18.45.23.68.13.23-.1.39-.32.39-.58v-6.4c.62-.65 1-1.52 1-2.49ZM28 17.73c3.13.08 3.13 4.67 0 4.75-3.13-.08-3.13-4.67 0-4.75Zm.44 8.82a.628.628 0 0 0-.88 0l-.93.93v-4.03c.84.36 1.91.36 2.75 0v4.03l-.93-.93Z"
      fill={props.fill || '#fff'}
    />
  </svg>
);

export default EnterprisePremiumIcon;
