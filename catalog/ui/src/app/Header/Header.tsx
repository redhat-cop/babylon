import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApplicationLauncher,
  ApplicationLauncherItem,
  Button,
  Dropdown,
  DropdownItem,
  DropdownPosition,
  DropdownToggle,
  PageHeader,
  PageHeaderTools,
} from '@patternfly/react-core';
import QuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/question-circle-icon';
import CommentIcon from '@patternfly/react-icons/dist/js/icons/comment-icon';
import CaretDownIcon from '@patternfly/react-icons/dist/js/icons/caret-down-icon';
import UserInterfaceLogo from '@app/components/UserInterfaceLogo';
import ImpersonateUserModal from '@app/components/ImpersonateUserModal';
import summitLogo from '@app/bgimages/Summit-Logo.svg';
import useImpersonateUser from '@app/utils/useImpersonateUser';
import useSession from '@app/utils/useSession';
import { getHelpUrl } from '@app/util';

import './header.css';

const Header: React.FC<{
  onNavToggleMobile: () => void;
  onNavToggle: () => void;
  isNavOpen: boolean;
  isMobileView: boolean;
}> = ({ isNavOpen, isMobileView, onNavToggle, onNavToggleMobile }) => {
  const [isUserControlDropdownOpen, setUserControlDropdownOpen] = useState(false);
  const [isUserHelpDropdownOpen, setUserHelpDropdownOpen] = useState(false);
  const { clearImpersonation, userImpersonated } = useImpersonateUser();
  const [impersonateUserModalIsOpen, setImpersonateUserModalIsOpen] = useState(false);
  const { isAdmin, email, userInterface } = useSession().getSession();
  const navigate = useNavigate();

  function clearUserImpersonation() {
    clearImpersonation();
    setUserControlDropdownOpen(false);
  }

  function LogoImg() {
    if (userInterface == 'summit') {
      return (
        <img
          src={summitLogo}
          onClick={() => navigate('/')}
          alt="Red Hat Summit"
          className="summit-logo"
          style={{ height: '48px' }}
        />
      );
    }
    return <UserInterfaceLogo onClick={() => navigate('/')} style={{ width: '278px' }} />;
  }
  const openSupportCase = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const userEmail = userImpersonated ? userImpersonated : email;
    const url = getHelpUrl(userEmail);
    window.open(url, '_blank');
    return null;
  };

  const UserHelpDropdownItems = [
    <ApplicationLauncherItem key="open-support" component="button" onClick={openSupportCase} isExternal>
      Open Support Case
    </ApplicationLauncherItem>,
    <ApplicationLauncherItem
      key="status-page-link"
      href="https://rhdp.statuspage.io/"
      target="_blank"
      rel="noreferrer nofollow"
      isExternal
    >
      Status Page
    </ApplicationLauncherItem>,
    <ApplicationLauncherItem key="support-sla" href="/support">
      Solution Support: SLAs
    </ApplicationLauncherItem>,
    <ApplicationLauncherItem
      key="how-to-videos-link"
      href="https://content.redhat.com/us/en/product/rhdp.html"
      target="_blank"
      rel="noreferrer nofollow"
      isExternal
    >
      Learn more
    </ApplicationLauncherItem>,
    <ApplicationLauncherItem
      key="how-to-videos-link"
      href="https://videos.learning.redhat.com/channel/RHPDS%2B-%2BRed%2BHat%2BProduct%2Band%2BPortfolio%2BDemo%2BSystem/277722533"
      target="_blank"
      rel="noreferrer nofollow"
      isExternal
    >
      How to videos
    </ApplicationLauncherItem>,
  ];
  const UserControlDropdownItems = [
    <DropdownItem
      key="logout"
      href="/oauth/sign_out"
      onClick={() => {
        sessionStorage.removeItem('impersonateUser');
      }}
    >
      Log out
    </DropdownItem>,
  ];
  if (isAdmin || userImpersonated) {
    UserControlDropdownItems.push(
      <DropdownItem key="impersonate" onClick={() => setImpersonateUserModalIsOpen(true)}>
        Impersonate user
      </DropdownItem>,
    );
    if (userImpersonated) {
      UserControlDropdownItems.push(
        <DropdownItem key="clear-impersonation" onClick={clearUserImpersonation}>
          Clear user impersonation
        </DropdownItem>,
      );
    }
  }

  const HeaderTools = (
    <PageHeaderTools>
      <Button
        variant="link"
        icon={<CommentIcon />}
        style={{ color: '#fff' }}
        onClick={() =>
          window.open(
            'https://docs.google.com/forms/d/e/1FAIpQLSfwGW7ql2lDfaLDpg4Bgj_puFEVsM0El6-Nz8fyH48RnGLDrA/viewform?usp=sf_link',
            '_blank',
          )
        }
      >
        Feedback
      </Button>
      <ApplicationLauncher
        aria-label="Help menu"
        onSelect={() => setUserHelpDropdownOpen((prevIsOpen) => !prevIsOpen)}
        onToggle={(isOpen: boolean) => setUserHelpDropdownOpen(isOpen)}
        isOpen={isUserHelpDropdownOpen}
        items={UserHelpDropdownItems}
        position={DropdownPosition.right}
        toggleIcon={
          <div
            style={{ display: 'flex', gap: 'var(--pf-global--spacer--xs)', flexDirection: 'row', alignItems: 'center' }}
          >
            <QuestionCircleIcon />
            Help
          </div>
        }
      />
      <Dropdown
        className={`header-component__user-controls${
          userImpersonated ? ' header-component__user-controls--warning' : ''
        }`}
        position={DropdownPosition.right}
        isOpen={isUserControlDropdownOpen}
        dropdownItems={UserControlDropdownItems}
        toggle={
          <DropdownToggle
            aria-label="Loging menu"
            onToggle={() => setUserControlDropdownOpen((isOpen) => !isOpen)}
            toggleIndicator={CaretDownIcon}
          >
            {userImpersonated ? userImpersonated : email}
          </DropdownToggle>
        }
      />
      {impersonateUserModalIsOpen ? (
        <ImpersonateUserModal isOpen={true} onClose={() => setImpersonateUserModalIsOpen(false)} />
      ) : null}
    </PageHeaderTools>
  );

  return (
    <PageHeader
      logo={<LogoImg />}
      className="header-component"
      headerTools={HeaderTools}
      showNavToggle
      isNavOpen={isNavOpen}
      onNavToggle={isMobileView ? onNavToggleMobile : onNavToggle}
    />
  );
};

export default Header;
