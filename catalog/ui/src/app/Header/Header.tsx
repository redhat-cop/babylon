import React, { useEffect, useState } from 'react';
import { listUsers } from '@app/api';
import { User, UserList } from '@app/types';
import { useNavigate } from 'react-router-dom';
import {
  ApplicationLauncher,
  ApplicationLauncherItem,
  Dropdown,
  DropdownItem,
  DropdownPosition,
  DropdownToggle,
  PageHeader,
  PageHeaderTools,
  SearchInput,
} from '@patternfly/react-core';
import { CaretDownIcon, QuestionCircleIcon } from '@patternfly/react-icons';
import UserInterfaceLogo from '@app/components/UserInterfaceLogo';
import summitLogo from '@app/bgimages/Summit-Logo.svg';
import useImpersonateUser from '@app/utils/useImpersonateUser';
import useSession from '@app/utils/useSession';
import Modal, { useModal } from '@app/Modal/Modal';

import './header.css';

const Header: React.FC<{
  onNavToggleMobile: () => void;
  onNavToggle: () => void;
  isNavOpen: boolean;
  isMobileView: boolean;
}> = ({ isNavOpen, isMobileView, onNavToggle, onNavToggleMobile }) => {
  const [isUserControlDropdownOpen, setUserControlDropdownOpen] = useState(false);
  const [isUserHelpDropdownOpen, setUserHelpDropdownOpen] = useState(false);
  const { setImpersonation, userImpersonated, clearImpersonation } = useImpersonateUser();
  const [impersonationModal, openImpersonationModal] = useModal();
  const [users, setUsers] = useState<User[]>([]);
  const [userImpersonationDialogState, setUserImpersonationDialogState] = useState<{
    matchCount: number;
    value: string;
  }>({
    matchCount: 0,
    value: '',
  });
  const navigate = useNavigate();
  const { isAdmin, email, userInterface } = useSession().getSession();

  useEffect(() => {
    async function getAllUsersList() {
      const resp: UserList = await listUsers({ disableImpersonation: true });
      setUsers(resp.items);
    }
    if (isAdmin) {
      getAllUsersList();
    }
  }, [isAdmin]);

  function applyUserImpersonation() {
    setImpersonation(userImpersonationDialogState.value);
    navigate('/');
  }

  function openUserImpersonationDialog() {
    openImpersonationModal();
    setUserImpersonationDialogState({
      matchCount: 0,
      value: '',
    });
  }

  function clearUserImpersonation() {
    clearImpersonation();
    setUserControlDropdownOpen(false);
  }

  function onUserImpersonationSearchInputChange(value: string) {
    const exactMatch = users.filter((user) => user.metadata.name === value);
    const filteredUsers =
      exactMatch.length === 1 ? exactMatch : users.filter((user) => user.metadata.name.startsWith(value));
    setUserImpersonationDialogState({
      matchCount: filteredUsers.length,
      value: filteredUsers.length === 1 ? filteredUsers[0].metadata.name : value,
    });
  }

  function onUserImpersonationSearchInputClear() {
    setUserImpersonationDialogState({
      matchCount: 0,
      value: '',
    });
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
    const user = userImpersonated ? userImpersonated : email;
    if (user.includes('@redhat.com')) {
      window.open('https://red.ht/rhpds-help', '_blank');
      return;
    }
    window.open('https://red.ht/open-support', '_blank');
  };

  const UserHelpDropdownItems = [
    <ApplicationLauncherItem key="open-support" component="button" onClick={openSupportCase} isExternal>
      Open Support Case
    </ApplicationLauncherItem>,
    <ApplicationLauncherItem
      key="status-page-link"
      href="https://rhpds-demos.statuspage.io/"
      target="_blank"
      rel="noreferrer nofollow"
      isExternal
    >
      Status Page
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
      <DropdownItem key="impersonate" onClick={openUserImpersonationDialog}>
        Impersonate user
      </DropdownItem>
    );
    if (userImpersonated) {
      UserControlDropdownItems.push(
        <DropdownItem key="clear-impersonation" onClick={clearUserImpersonation}>
          Clear user impersonation
        </DropdownItem>
      );
    }
  }

  const HeaderTools = (
    <PageHeaderTools>
      <ApplicationLauncher
        aria-label="Help menu"
        onSelect={() => setUserHelpDropdownOpen((prevIsOpen) => !prevIsOpen)}
        onToggle={(isOpen: boolean) => setUserHelpDropdownOpen(isOpen)}
        isOpen={isUserHelpDropdownOpen}
        items={UserHelpDropdownItems}
        position={DropdownPosition.right}
        toggleIcon={<QuestionCircleIcon />}
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
      <Modal
        title="Impersonate User"
        ref={impersonationModal}
        isDisabled={userImpersonationDialogState.matchCount != 1}
        onConfirm={applyUserImpersonation}
      >
        <SearchInput
          placeholder="Select user"
          value={userImpersonationDialogState.value}
          onChange={onUserImpersonationSearchInputChange}
          onClear={onUserImpersonationSearchInputClear}
          resultsCount={userImpersonationDialogState.matchCount}
        />
      </Modal>
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
