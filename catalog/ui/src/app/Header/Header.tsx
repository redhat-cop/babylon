import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { listUsers } from '@app/api';
import { User, UserList } from '@app/types';
import { useHistory } from 'react-router-dom';
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
import rhpdsLogo from '@app/bgimages/RHPDS-Logo.svg';
import summitLogo from '@app/bgimages/Summit-Logo.svg';
import useImpersonateUser from '@app/utils/useImpersonateUser';
import useSession from '@app/utils/useSession';
import Modal from '@app/Modal/Modal';

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
  const impersonationModal = useRef(null);
  const [users, setUsers] = useState<User[]>([]);
  const [userImpersonationDialogState, setUserImpersonationDialogState] = useState<{
    matchCount: number;
    value: string;
  }>({
    matchCount: 0,
    value: '',
  });
  const history = useHistory();
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
    history.push('/');
  }

  function openUserImpersonationDialog() {
    impersonationModal.current.open();
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
    function handleClick() {
      history.push('/');
    }
    if (userInterface == 'summit') {
      return (
        <img
          src={summitLogo}
          onClick={handleClick}
          alt="Red Hat Summit"
          className="summit-logo"
          style={{ height: '48px' }}
        />
      );
    }
    return (
      <img
        src={rhpdsLogo}
        onClick={handleClick}
        alt="Red Hat Product Demo System Logo"
        className="rhpds-logo"
        style={{ width: '220px' }}
      />
    );
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
    <ApplicationLauncherItem key="status-page-link" href="https://rhpds-demos.statuspage.io/" isExternal>
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
        toggleIcon={<QuestionCircleIcon />}
      />
      <Dropdown
        className={classNames(userImpersonated ? ['rhpds-user-controls', 'rhpds-warning'] : ['rhpds-user-controls'])}
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
