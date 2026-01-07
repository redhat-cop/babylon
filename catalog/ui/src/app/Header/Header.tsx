import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dropdown,
  DropdownList,
  DropdownItem,
  Masthead,
  MastheadLogo,
  MastheadContent,
  MastheadMain,
  MastheadToggle,
  MastheadBrand,
  MenuToggle,
  PageToggleButton,
  MenuToggleElement,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import QuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/question-circle-icon';

import UserInterfaceLogo from '@app/components/UserInterfaceLogo';
import ImpersonateUserModal from '@app/components/ImpersonateUserModal';
import summitLogo from '@app/bgimages/Summit-Logo.svg';
import useImpersonateUser from '@app/utils/useImpersonateUser';
import useSession from '@app/utils/useSession';
import useHelpLink from '@app/utils/useHelpLink';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';
import BarsIcon from '@patternfly/react-icons/dist/js/icons/bars-icon';
import IncidentsNotificationDrawer from '@app/components/IncidentsNotificationDrawer';

import './header.css';

const Header: React.FC<{
  onNavToggleMobile: () => void;
  onNavToggle: () => void;
  isNavOpen: boolean;
  isMobileView: boolean;
}> = ({ isNavOpen, isMobileView, onNavToggle, onNavToggleMobile }) => {
  const [isUserControlDropdownOpen, setIsUserControlDropdownOpen] = useState(false);
  const [isUserHelpDropdownOpen, setIsUserHelpDropdownOpen] = useState(false);
  const { clearImpersonation, userImpersonated } = useImpersonateUser();
  const [impersonateUserModalIsOpen, setImpersonateUserModalIsOpen] = useState(false);
  const { isAdmin, email, userInterface } = useSession().getSession();
  const navigate = useNavigate();
  const helpLink = useHelpLink();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const { help_text, status_page_url, feedback_link, learn_more_link, workshop_support_text, workshop_support_link, onboarding_support_text, onboarding_support_link } =
    useInterfaceConfig();

  function clearUserImpersonation() {
    clearImpersonation();
    setIsUserControlDropdownOpen(false);
  }

  function LogoImg({ theme }: { theme: 'dark' | 'light200' }) {
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
    return <UserInterfaceLogo onClick={() => navigate('/')} theme={theme} />;
  }
  const onSelect = (event?: React.MouseEvent<Element, MouseEvent>, value?: string | number) => {
    event.preventDefault();
    setIsUserHelpDropdownOpen(false);
    window.open(value as string, '_blank');
    return null;
  };

  const userHelpDropdownItems = [];
  if (helpLink) {
    userHelpDropdownItems.push(
      <DropdownItem key="open-support" value={helpLink}>
        {help_text}
      </DropdownItem>,
    );
  }

  if (workshop_support_link) {
    userHelpDropdownItems.push(
      <DropdownItem key="workshop-support" value={workshop_support_link}>
        {workshop_support_text}
      </DropdownItem>,
    );
    if (onboarding_support_link) {
      userHelpDropdownItems.push(
        <DropdownItem key="onboarding-support" value={onboarding_support_link}>
          {onboarding_support_text}
        </DropdownItem>,
      );
    }
  }
  if (onboarding_support_link) {
    userHelpDropdownItems.push(
      <DropdownItem key="onboarding-support" value={onboarding_support_link}>
        {onboarding_support_text}
      </DropdownItem>,
    );
  }

  if (status_page_url) {
    userHelpDropdownItems.push(
        <DropdownItem key="status-page-link" value={status_page_url}>
          Status Page
        </DropdownItem>,
      );
  }

  if (userInterface === 'rhpds') {
    userHelpDropdownItems.push(
      <DropdownItem key="support-sla" value="/support">
        Solution Support: Service Level
      </DropdownItem>,
    );
  }
  if (learn_more_link) {
    userHelpDropdownItems.push(
      <DropdownItem key="learn-more" value={learn_more_link}>
        Learn more
      </DropdownItem>,
    );
  }
  if (userInterface === 'rhpds') {
    userHelpDropdownItems.push(
      <DropdownItem
        key="how-to-videos-link"
        value="https://videos.learning.redhat.com/channel/RHPDS%2B-%2BRed%2BHat%2BProduct%2Band%2BPortfolio%2BDemo%2BSystem/277722533"
      >
        How to videos
      </DropdownItem>,
    );
  }
  if (feedback_link) {
    userHelpDropdownItems.push(
      <DropdownItem key="feedback" value={feedback_link}>
        Feedback
      </DropdownItem>,
    );
  }
  const UserControlDropdownItems = [
    <DropdownItem
      key="logout"
      onClick={() => {
        sessionStorage.removeItem('impersonateUser');
        window.location.href = '/oauth/sign_out';
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

  const headerTools = (
    <Toolbar>
      <ToolbarContent>
        <ToolbarGroup align={{ default: 'alignEnd' }}>
          <IncidentsNotificationDrawer />
          <ToolbarGroup variant="action-group-plain">
            <ToolbarItem>
              <Dropdown
                isOpen={isUserHelpDropdownOpen}
                onOpenChange={(isOpen: boolean) => setIsUserHelpDropdownOpen(isOpen)}
                onOpenChangeKeys={['Escape']}
                onSelect={onSelect}
                ref={menuRef}
                isScrollable
                toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                  <MenuToggle
                    aria-label="Help menu"
                    ref={toggleRef}
                    variant="plain"
                    onClick={() => setIsUserHelpDropdownOpen(true)}
                    isExpanded={isUserHelpDropdownOpen}
                    icon={<QuestionCircleIcon />}
                  >
                    Help
                  </MenuToggle>
                )}
              >
                <DropdownList>{userHelpDropdownItems}</DropdownList>
              </Dropdown>
            </ToolbarItem>
            <ToolbarItem>
              <Dropdown
                isOpen={isUserControlDropdownOpen}
                onOpenChange={(isOpen: boolean) => setIsUserControlDropdownOpen(isOpen)}
                isScrollable
                toggle={(el: React.Ref<MenuToggleElement>) => (
                  <MenuToggle
                    ref={el}
                    variant="plainText"
                    aria-label="Log in menu"
                    onClick={() => setIsUserControlDropdownOpen((isOpen) => !isOpen)}
                    style={{ width: 'auto', color: userImpersonated ? '#FF0000' : '#151515', fill: '#151515' }}
                  >
                    {userImpersonated ? userImpersonated : email}
                  </MenuToggle>
                )}
              >
                <DropdownList>{UserControlDropdownItems.map((item) => item)}</DropdownList>
              </Dropdown>
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarGroup>
      </ToolbarContent>
    </Toolbar>
  );

  return (
    <>
      {impersonateUserModalIsOpen ? (
        <ImpersonateUserModal isOpen={true} onClose={() => setImpersonateUserModalIsOpen(false)} />
      ) : null}
      <Masthead className="header-component">
        <MastheadMain>
          <MastheadToggle>
            <PageToggleButton
              variant="plain"
              aria-label="Global navigation"
              isSidebarOpen={isNavOpen}
              onSidebarToggle={isMobileView ? onNavToggleMobile : onNavToggle}
              id="nav-toggle"
            >
              <BarsIcon id="nav-toggle" />
            </PageToggleButton>
          </MastheadToggle>
          <MastheadBrand data-codemods>
            <MastheadLogo data-codemods href="/" style={{ display: 'flex', alignItems: 'center' }}>
              <LogoImg theme="light200" />
            </MastheadLogo>
          </MastheadBrand>
        </MastheadMain>
        <MastheadContent>{headerTools}</MastheadContent>
      </Masthead>
    </>
  );
};

export default Header;
