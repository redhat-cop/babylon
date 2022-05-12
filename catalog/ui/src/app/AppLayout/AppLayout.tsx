import * as React from 'react';
import classNames from 'classnames';
import './app-layout.css';
import { useDispatch, useSelector } from 'react-redux';

import { getApiSession, getUserInfo, listUsers } from '@app/api';
import { User, UserList } from '@app/types';
import useStatusPageEmbed from './useStatusPageEmbed';

import {
  actionClearImpersonation,
  actionSetImpersonation,
  actionStartSession,
  selectAuthIsAdmin,
  selectAuthUser,
  selectImpersonationUser,
  selectInterface,
} from '@app/store';

import { useHistory } from 'react-router-dom';

import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownPosition,
  DropdownToggle,
  Modal,
  ModalVariant,
  Page,
  PageHeader,
  PageHeaderTools,
  PageSidebar,
  SearchInput,
  SkipToContent,
} from '@patternfly/react-core';

import CaretDownIcon from '@patternfly/react-icons/dist/js/icons/caret-down-icon';

interface IUserImpersonationDialogState {
  isOpen: boolean;
  matchCount: number;
  value: string;
}

import Navigation from './Navigation';

import rhpdsLogo from '@app/bgimages/RHPDS-Logo.svg';
import summitLogo from '@app/bgimages/Summit-Logo.svg';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FunctionComponent<AppLayoutProps> = ({ children }) => {
  const [isNavOpen, setIsNavOpen] = React.useState(true);
  const [isUserControlDropdownOpen, setUserControlDropdownOpen] = React.useState(false);
  const [isMobileView, setIsMobileView] = React.useState(true);
  const [isNavOpenMobile, setIsNavOpenMobile] = React.useState(false);
  const [users, setUsers] = React.useState<User[]>([]);
  const [userImpersonationDialogState, setUserImpersonationDialogState] = React.useState<IUserImpersonationDialogState>(
    {
      isOpen: false,
      matchCount: 0,
      value: '',
    }
  );
  const history = useHistory();
  useStatusPageEmbed();

  const dispatch = useDispatch();
  const authIsAdmin = useSelector(selectAuthIsAdmin);
  const authUser = useSelector(selectAuthUser);
  const impersonateUser = useSelector(selectImpersonationUser);
  const userInterface = useSelector(selectInterface);

  React.useEffect(() => {
    waitForSession();
  }, []);

  const onNavToggleMobile = () => {
    setIsNavOpenMobile(!isNavOpenMobile);
  };
  const onNavToggle = () => {
    setIsNavOpen(!isNavOpen);
  };
  const onPageResize = (props: { mobileView: boolean; windowSize: number }) => {
    setIsMobileView(props.mobileView);
  };
  const impersonateUserName = sessionStorage.getItem('impersonateUser');

  async function getUsers({ session }): Promise<void> {
    const resp: UserList = await listUsers({ disableImpersonation: true });
    setUsers(resp.items);
  }

  async function waitForSession() {
    const session = await getApiSession();
    if (impersonateUserName) {
      const userInfo = await getUserInfo(impersonateUserName);
      dispatch(
        actionSetImpersonation({
          admin: userInfo.admin,
          user: impersonateUserName,
          groups: userInfo.groups || [],
          catalogNamespaces: userInfo.catalogNamespaces,
          serviceNamespaces: userInfo.serviceNamespaces,
          userNamespace: userInfo.userNamespace,
        })
      );
    } else {
      dispatch(
        actionStartSession({
          admin: session.admin || false,
          consoleURL: session.consoleURL,
          groups: session.groups || [],
          interface: session.interface,
          user: session.user,
          catalogNamespaces: session.catalogNamespaces,
          serviceNamespaces: session.serviceNamespaces,
          userNamespace: session.userNamespace,
        })
      );
    }
    getUsers(session);
  }

  async function applyUserImpersonation() {
    const user = userImpersonationDialogState.value;
    const userInfo = await getUserInfo(user);
    dispatch(
      actionSetImpersonation({
        admin: userInfo.admin,
        user: user,
        groups: userInfo.groups || [],
        catalogNamespaces: userInfo.catalogNamespaces,
        serviceNamespaces: userInfo.serviceNamespaces,
        userNamespace: userInfo.userNamespace,
      })
    );
    sessionStorage.setItem('impersonateUser', user);
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
    dispatch(actionClearImpersonation());
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
  if (authIsAdmin || impersonateUserName) {
    UserControlDropdownItems.push(
      <DropdownItem key="impersonate" onClick={openUserImpersonationDialog}>
        Impersonate user
      </DropdownItem>
    );
    if (impersonateUser) {
      UserControlDropdownItems.push(
        <DropdownItem key="clear-impersonation" onClick={clearUserImpersonation}>
          Clear user impersonation
        </DropdownItem>
      );
    }
  }

  const HeaderTools = (
    <PageHeaderTools>
      <Dropdown
        className={classNames(impersonateUser ? ['rhpds-user-controls', 'rhpds-warning'] : ['rhpds-user-controls'])}
        position={DropdownPosition.right}
        isOpen={isUserControlDropdownOpen}
        dropdownItems={UserControlDropdownItems}
        toggle={
          <DropdownToggle
            aria-label="user actions dropdown"
            onToggle={() => setUserControlDropdownOpen((isOpen) => !isOpen)}
            toggleIndicator={CaretDownIcon}
          >
            {impersonateUser ? impersonateUser : authUser}
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

  const Header = (
    <PageHeader
      logo={<LogoImg />}
      headerTools={HeaderTools}
      showNavToggle
      isNavOpen={isNavOpen}
      onNavToggle={isMobileView ? onNavToggleMobile : onNavToggle}
    />
  );

  const Sidebar = (
    <PageSidebar theme="dark" nav={<Navigation />} isNavOpen={isMobileView ? isNavOpenMobile : isNavOpen} />
  );

  const pageId = 'primary-app-container';

  const PageSkipToContent = (
    <SkipToContent
      onClick={(event) => {
        event.preventDefault();
        const primaryContentContainer = document.getElementById(pageId);
        primaryContentContainer && primaryContentContainer.focus();
      }}
      href={`#${pageId}`}
    >
      Skip to Content
    </SkipToContent>
  );
  return (
    <Page
      mainContainerId={pageId}
      header={Header}
      sidebar={Sidebar}
      onPageResize={onPageResize}
      skipToContent={PageSkipToContent}
    >
      {children}
    </Page>
  );
};

export default AppLayout;
