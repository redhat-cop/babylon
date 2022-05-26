import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
import { listUsers } from '@app/api';
import { User, UserList } from '@app/types';
import { selectInterface } from '@app/store';
import { useHistory } from 'react-router-dom';
import {
  ApplicationLauncher,
  ApplicationLauncherItem,
  Button,
  Dropdown,
  DropdownItem,
  DropdownPosition,
  DropdownToggle,
  Modal,
  ModalVariant,
  PageHeader,
  PageHeaderTools,
  SearchInput,
} from '@patternfly/react-core';
import { CaretDownIcon, QuestionCircleIcon } from '@patternfly/react-icons';
import rhpdsLogo from '@app/bgimages/RHPDS-Logo.svg';
import summitLogo from '@app/bgimages/Summit-Logo.svg';
import useImpersonateUser from './useImpersonateUser';
import useSession from '@app/utils/useSession';

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
  const [users, setUsers] = useState<User[]>([]);
  const [userImpersonationDialogState, setUserImpersonationDialogState] = useState<{
    isOpen: boolean;
    matchCount: number;
    value: string;
  }>({
    isOpen: false,
    matchCount: 0,
    value: '',
  });
  const history = useHistory();
  const dispatch = useDispatch();
  const { isAdmin, email } = useSession().getSession();
  const userInterface = useSelector(selectInterface);

  useEffect(() => {
    async function getAllUsersList() {
      const resp: UserList = await listUsers({ disableImpersonation: true });
      setUsers(resp.items);
    }
    if (isAdmin) {
      getAllUsersList();
    }
  }, [dispatch, isAdmin]);

  async function applyUserImpersonation() {
    setImpersonation(userImpersonationDialogState.value);
    setUserImpersonationDialogState({
      isOpen: false,
      matchCount: 0,
      value: '',
    });
    history.push('/');
  }

  function closeUserImpersonationDialog() {
    setUserImpersonationDialogState({
      isOpen: false,
      matchCount: 0,
      value: '',
    });
  }

  function openUserImpersonationDialog() {
    setUserImpersonationDialogState({
      isOpen: true,
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
      isOpen: true,
      matchCount: filteredUsers.length,
      value: filteredUsers.length === 1 ? filteredUsers[0].metadata.name : value,
    });
  }

  function onUserImpersonationSearchInputClear() {
    setUserImpersonationDialogState({
      isOpen: true,
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
    } else if (userInterface == 'rhpds') {
      return (
        <img
          src={rhpdsLogo}
          onClick={handleClick}
          alt="Red Hat Product Demo System Logo"
          className="rhpds-logo"
          style={{ width: '220px' }}
        />
      );
    } else {
      return null;
    }
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
        variant={ModalVariant.small}
        title="Impersonate User"
        isOpen={userImpersonationDialogState.isOpen}
        onClose={closeUserImpersonationDialog}
        actions={[
          <Button
            key="confirm"
            variant="primary"
            isDisabled={userImpersonationDialogState.matchCount != 1}
            onClick={applyUserImpersonation}
          >
            Confirm
          </Button>,
          <Button key="cancel" variant="link" onClick={closeUserImpersonationDialog}>
            Cancel
          </Button>,
        ]}
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
