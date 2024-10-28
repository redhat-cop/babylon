import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dropdown,
  DropdownList,
  DropdownItem,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadMain,
  MastheadToggle,
  MenuToggle,
  PageToggleButton,
  MenuToggleElement,
} from '@patternfly/react-core';
import {
  Dropdown as DropdownLegacy,
  DropdownItem as DropdownItemLegacy,
  DropdownPosition,
  DropdownToggle,
} from '@patternfly/react-core/deprecated';
import QuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/question-circle-icon';
import CommentIcon from '@patternfly/react-icons/dist/js/icons/comment-icon';
import CaretDownIcon from '@patternfly/react-icons/dist/js/icons/caret-down-icon';
import UserInterfaceLogo from '@app/components/UserInterfaceLogo';
import ImpersonateUserModal from '@app/components/ImpersonateUserModal';
import summitLogo from '@app/bgimages/Summit-Logo.svg';
import useImpersonateUser from '@app/utils/useImpersonateUser';
import useSession from '@app/utils/useSession';
import useHelpLink from '@app/utils/useHelpLink';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';
import BarsIcon from '@patternfly/react-icons/dist/js/icons/bars-icon';

import './header.css';

const Header: React.FC<{
  onNavToggleMobile: () => void;
  onNavToggle: () => void;
  isNavOpen: boolean;
  isMobileView: boolean;
  theme: 'dark' | 'light200';
}> = ({ isNavOpen, isMobileView, onNavToggle, onNavToggleMobile, theme = 'dark' }) => {
  const [isUserControlDropdownOpen, setUserControlDropdownOpen] = useState(false);
  const [isUserHelpDropdownOpen, setUserHelpDropdownOpen] = useState(false);
  const { clearImpersonation, userImpersonated } = useImpersonateUser();
  const [impersonateUserModalIsOpen, setImpersonateUserModalIsOpen] = useState(false);
  const { isAdmin, email, userInterface } = useSession().getSession();
  const navigate = useNavigate();
  const helpLink = useHelpLink();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const { help_text, status_page_url, feedback_link, learn_more_link, workshop_support_text, workshop_support_link } =
    useInterfaceConfig();

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
    return <UserInterfaceLogo onClick={() => navigate('/')} style={{ width: '278px' }} theme={theme} />;
  }
  const onSelect = (event?: React.MouseEvent<Element, MouseEvent>, value?: string | number) => {
    event.preventDefault();
    setUserHelpDropdownOpen(false);
    window.open(value as string, '_blank');
    return null;
  };

  const userHelpDropdownItems = [
    <DropdownItem key="open-support" value={helpLink}>
      {help_text}
    </DropdownItem>,
  ];

  if (userInterface === 'rhpds') {
    userHelpDropdownItems.push(
      <DropdownItem key="workshop-support" value={workshop_support_link}>
        {workshop_support_text}
      </DropdownItem>
    );
  }

  userHelpDropdownItems.push(
    <DropdownItem key="status-page-link" value={status_page_url}>
      Status Page
    </DropdownItem>
  );

  if (userInterface === 'rhpds') {
    userHelpDropdownItems.push(
      <DropdownItem key="support-sla" value="/support">
        Solution Support: Service Level
      </DropdownItem>
    );
  }
  userHelpDropdownItems.push(
    <DropdownItem key="learn-more" value={learn_more_link}>
      Learn more
    </DropdownItem>
  );
  if (userInterface === 'rhpds') {
    userHelpDropdownItems.push(
      <DropdownItem
        key="how-to-videos-link"
        value="https://videos.learning.redhat.com/channel/RHPDS%2B-%2BRed%2BHat%2BProduct%2Band%2BPortfolio%2BDemo%2BSystem/277722533"
      >
        How to videos
      </DropdownItem>
    );
  }
  const UserControlDropdownItems = [
    <DropdownItemLegacy
      key="logout"
      href="/oauth/sign_out"
      onClick={() => {
        sessionStorage.removeItem('impersonateUser');
      }}
    >
      Log out
    </DropdownItemLegacy>,
  ];
  if (isAdmin || userImpersonated) {
    UserControlDropdownItems.push(
      <DropdownItemLegacy key="impersonate" onClick={() => setImpersonateUserModalIsOpen(true)}>
        Impersonate user
      </DropdownItemLegacy>
    );
    if (userImpersonated) {
      UserControlDropdownItems.push(
        <DropdownItemLegacy key="clear-impersonation" onClick={clearUserImpersonation}>
          Clear user impersonation
        </DropdownItemLegacy>
      );
    }
  }

  const headerTools = (
    <div style={{ marginLeft: 'auto' }}>
      {feedback_link ? (
        <Button
          variant="link"
          style={{ color: theme === 'dark' ? '#fff' : '#151515' }}
          icon={<CommentIcon />}
          onClick={() => window.open(feedback_link, '_blank')}
        >
          Feedback
        </Button>
      ) : null}

      <Dropdown
        isOpen={isUserHelpDropdownOpen}
        onOpenChange={(isOpen: boolean) => setUserHelpDropdownOpen(isOpen)}
        onOpenChangeKeys={['Escape']}
        onSelect={onSelect}
        ref={menuRef}
        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
          <MenuToggle
            aria-label="Help menu"
            ref={toggleRef}
            variant="plain"
            onClick={() => setUserHelpDropdownOpen(true)}
            isExpanded={isUserHelpDropdownOpen}
            style={{ width: 'auto' }}
          >
            <div
              style={{
                display: 'inline-block',
                color: theme === 'dark' ? '#fff' : '#151515',
              }}
            >
              <QuestionCircleIcon />
              <span style={{ marginLeft: 'var(--pf-v5-global--spacer--xs)' }}>Help</span>
            </div>
          </MenuToggle>
        )}
      >
        <DropdownList>{userHelpDropdownItems}</DropdownList>
      </Dropdown>

      <DropdownLegacy
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
    </div>
  );

  return (
    <Masthead backgroundColor={theme}>
      <MastheadToggle>
        <PageToggleButton
          variant="plain"
          aria-label="Global navigation"
          isSidebarOpen={isNavOpen}
          onSidebarToggle={isMobileView ? onNavToggleMobile : onNavToggle}
          id="nav-toggle"
        >
          <BarsIcon color={theme === 'dark' ? '#fff' : '#151515'} id="nav-toggle" />
        </PageToggleButton>
      </MastheadToggle>
      <MastheadMain>
        <MastheadBrand href="/">
          <LogoImg />
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>{headerTools}</MastheadContent>
    </Masthead>
  );
};

export default Header;
