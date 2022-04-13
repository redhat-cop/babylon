import React from 'react';

import rhpdsLogo from '@app/bgimages/RHPDS-Logo.svg';

interface UserInterfaceLogoProps {
  onClick?: () => void;
}

const UserInterfaceLogo: React.FunctionComponent<UserInterfaceLogoProps> = ({ onClick }) => {
  return <img alt="Red Hat Product Demo System" className="rhpds-logo" onClick={onClick} src={rhpdsLogo} />;
};

export default UserInterfaceLogo;
