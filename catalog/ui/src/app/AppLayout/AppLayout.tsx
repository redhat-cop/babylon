import * as React from 'react';
import './app-layout.css';
import {
  useDispatch,
  useSelector,
} from 'react-redux'

import {
  getApiSession,
  getUserInfo,
  listClusterCustomObject,
} from '@app/api';

import {
  actionClearImpersonation,
  actionSetImpersonation,
  actionStartSession,
  selectAuthIsAdmin,
  selectAuthUser,
  selectImpersonationUser,
} from '@app/store';

import { NavLink, useLocation, useHistory } from 'react-router-dom';

import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownPosition,
  DropdownToggle,
  Modal,
  ModalVariant,
  Nav,
  NavList,
  NavItem,
  NavExpandable,
  Page,
  PageHeader,
  PageHeaderTools,
  PageSidebar,
  SearchInput,
  SkipToContent
} from '@patternfly/react-core';

import CaretDownIcon from '@patternfly/react-icons/dist/js/icons/caret-down-icon';
import UserIcon from '@patternfly/react-icons/dist/js/icons/user-icon';

import { routes, IAppRoute, IAppRouteGroup } from '@app/routes';
import logo from '@app/bgimages/RHPDS-Logo.svg';

interface IAppLayout {
  children: React.ReactNode;
}

const AppLayout: React.FunctionComponent<IAppLayout> = ({ children }) => {
  const [isNavOpen, setIsNavOpen] = React.useState(true);
  const [isUserControlDropdownOpen, setUserControlDropdownOpen] = React.useState(false);
  const [isMobileView, setIsMobileView] = React.useState(true);
  const [isNavOpenMobile, setIsNavOpenMobile] = React.useState(false);
  const [users, setUsers] = React.useState([]);
  const [userImpersonationDialogState, setUserImpersonationDialogState] = React.useState({});

  const onNavToggleMobile = () => {
    setIsNavOpenMobile(!isNavOpenMobile);
  };
  const onNavToggle = () => {
    setIsNavOpen(!isNavOpen);
  }
  const onPageResize = (props: { mobileView: boolean; windowSize: number }) => {
    setIsMobileView(props.mobileView);
  };

  const dispatch = useDispatch();
  const authIsAdmin = useSelector(selectAuthIsAdmin);
  const authUser = useSelector(selectAuthUser);
  const impersonateUser = useSelector(selectImpersonationUser);

  async function getUsers() {
    const resp = await listClusterCustomObject('user.openshift.io', 'v1', 'users');
    setUsers(resp.items);
  }

  async function waitForSession() {
    const session = await getApiSession();
    dispatch(
      actionStartSession({
        admin: session.admin || false,
        user: session.user,
        catalogNamespaces: session.catalogNamespaces,
        serviceNamespaces: session.serviceNamespaces,
        userNamespace: session.userNamespace,
      })
    );
    if (session.admin) {
      getUsers(session);
    }
  }

  async function applyUserImpersonation() {
    const user = userImpersonationDialogState.value;
    const userInfo = await getUserInfo(user);
    dispatch(
      actionSetImpersonation({
        user: user,
        admin: userInfo.admin,
        catalogNamespaces: userInfo.catalogNamespaces,
        serviceNamespaces: userInfo.serviceNamespaces,
        userNamespace: userInfo.userNamespace,
      })
    );
    setUserImpersonationDialogState({
      isOpen: false,
      matchCount: 0,
      value: "",
    });
  }

  function closeUserImpersonationDialog() {
    setUserImpersonationDialogState({
      isOpen: false,
      matchCount: 0,
      value: "",
    });
  }

  function openUserImpersonationDialog() {
    setUserImpersonationDialogState({
      isOpen: true,
      matchCount: 0,
      value: "",
    });
  }

  function clearUserImpersonation() {
    dispatch(actionClearImpersonation());
    setUserControlDropdownOpen(false);
  }

  function onUserImpersonationSearchInputChange(value: string) {
    const filteredUsers = users.filter(user => user.metadata.name.startsWith(value));
    setUserImpersonationDialogState({
      isOpen: true,
      matchCount: filteredUsers.length,
      value: filteredUsers.length == 1 ? filteredUsers[0].metadata.name : value,
    });
  }

  function onUserImpersonationSearchInputClear() {
    setUserImpersonationDialogState({
      isOpen: true,
      matchCount: 0,
      value: "",
    });
  }

  React.useEffect(() => {
    waitForSession();
  }, []);

  function LogoImg() {
    const history = useHistory();
    function handleClick() {
      history.push('/');
    }
    return (
      <img src={logo} onClick={handleClick} alt="Red Hat Product Demo System Logo" className="rhpds-logo" style={{height: "48px"}}/>
    );
  }

  const UserControlDropdownItems = [
    <DropdownItem key="logout" href="/oauth/sign_out">Log out</DropdownItem>,
  ];
  if (authIsAdmin) {
    UserControlDropdownItems.push(
      <DropdownItem key="impersonate" onClick={openUserImpersonationDialog}>Impersonate user</DropdownItem>
    )
    if (impersonateUser) {
      UserControlDropdownItems.push(
        <DropdownItem key="clear-impersonation" onClick={clearUserImpersonation}>Clear user impersonation</DropdownItem>
      )
    }
  }

  const HeaderTools = (
    <PageHeaderTools>
      <Dropdown
        className={impersonateUser ? ['rhpds-user-controls', 'rhpds-warning'] : ['rhpds-user-controls']}
        position={DropdownPosition.right}
        isOpen={isUserControlDropdownOpen}
        dropdownItems={UserControlDropdownItems}
        toggle={
          <DropdownToggle
            onToggle={() => setUserControlDropdownOpen(isOpen => !isOpen)}
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
          <Button key="confirm" variant="primary" isDisabled={userImpersonationDialogState.matchCount != 1} onClick={applyUserImpersonation}>
            Confirm
          </Button>,
          <Button key="cancel" variant="link" onClick={closeUserImpersonationDialog}>
            Cancel
          </Button>
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

  const location = useLocation();

  const renderNavItem = (route: IAppRoute, index: number) => (
    <NavItem key={`${route.label}-${index}`} id={`${route.label}-${index}`}>
      <NavLink exact={route.exact} to={route.path} activeClassName="pf-m-current">
        {route.label}
      </NavLink>
    </NavItem>
  );

  const renderNavGroup = (group: IAppRouteGroup, groupIndex: number) => (
    <NavExpandable
      key={`${group.label}-${groupIndex}`}
      id={`${group.label}-${groupIndex}`}
      title={group.label}
      isActive={group.routes.some((route) => route.path === location.pathname)}
    >
      {group.routes.map((route, idx) => route.label && renderNavItem(route, idx))}
    </NavExpandable>
  );

  const Navigation = (
    <Nav id="nav-primary-simple" theme="dark">
      <NavList id="nav-list-simple">
        {routes.map(
          (route, idx) => route.label && (!route.routes ? renderNavItem(route, idx) : renderNavGroup(route, idx))
        )}
      </NavList>
    </Nav>
  );

  const Sidebar = (
    <PageSidebar
      theme="dark"
      nav={Navigation}
      isNavOpen={isMobileView ? isNavOpenMobile : isNavOpen} />
  );

  const pageId = 'primary-app-container';

  const PageSkipToContent = (
    <SkipToContent onClick={(event) => {
      event.preventDefault();
      const primaryContentContainer = document.getElementById(pageId);
      primaryContentContainer && primaryContentContainer.focus();
    }} href={`#${pageId}`}>
      Skip to Content
    </SkipToContent>
  );
  return (
    <Page
      mainContainerId={pageId}
      header={Header}
      sidebar={Sidebar}
      onPageResize={onPageResize}
      skipToContent={PageSkipToContent}>
      {children}
    </Page>
  );
}

export { AppLayout };
