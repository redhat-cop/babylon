import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { PageHeader } from '@patternfly/react-core';
import UserInterfaceLogo from '@app/components/UserInterfaceLogo';
import summitLogo from '@app/bgimages/Summit-Logo.svg';

const WorkshopHeader: React.FC = () => {
  const history = useHistory();
  const { search } = useLocation();
  const userInterface = new URLSearchParams(search).get('userInterface');
  function LogoImg() {
    if (userInterface === 'summit') {
      return (
        <img
          src={summitLogo}
          onClick={() => history.push('/')}
          alt="Red Hat Summit"
          className="summit-logo"
          style={{ height: '48px' }}
        />
      );
    }
    return <UserInterfaceLogo onClick={() => history.push('/')} style={{ width: '278px' }} />;
  }
  return <PageHeader className="workshop" logo={<LogoImg />} />;
};

export default WorkshopHeader;
