import React from 'react';

import rhpdsLogo from '@app/bgimages/RHPDS-Logo-Beta.svg';

const UserInterfaceLogo: React.FC<
  {
    onClick?: () => void;
  } & React.HTMLAttributes<HTMLImageElement>
> = ({ onClick, ...rest }) => {
  return <img alt="Red Hat Product Demo System" className="rhpds-logo" {...rest} onClick={onClick} src={rhpdsLogo} />;
};

export default UserInterfaceLogo;
