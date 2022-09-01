import React from 'react';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '@patternfly/react-core';
import UserInterfaceLogo from '@app/components/UserInterfaceLogo';
import summitLogo from '@app/bgimages/Summit-Logo.svg';
import redHatLogo from '@app/bgimages/RedHat-Logo.svg';

const WorkshopHeader: React.FC = () => {
  const { search } = useLocation();
  const userInterface = new URLSearchParams(search).get('userInterface');
  function LogoImg() {
    if (userInterface === 'summit') {
      return (
        <a href="https://summit.demo.redhat.com/" style={{ display: 'flex', width: '70px' }}>
          <img src={summitLogo} alt="Red Hat Summit" />
        </a>
      );
    }
    return (
      <a href="/" style={{ width: '278px', display: 'flex' }}>
        <UserInterfaceLogo />
      </a>
    );
  }
  return (
    <div style={{ backgroundColor: 'var(--pf-c-page__header--BackgroundColor)', gridArea: 'header' }}>
      <PageHeader
        className="workshop"
        logo={<LogoImg />}
        style={{ maxWidth: '1170px', margin: '0 auto', width: '100%' }}
        headerTools={
          userInterface === 'summit' ? (
            <a href="https://redhat.com/" style={{ width: '138px', marginLeft: 'auto', display: 'flex' }}>
              <img src={redHatLogo} alt="Red Hat" />
            </a>
          ) : null
        }
      ></PageHeader>
    </div>
  );
};

export default WorkshopHeader;
