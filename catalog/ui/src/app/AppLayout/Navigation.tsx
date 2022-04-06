import * as React from 'react';
import { useSelector } from 'react-redux';
import { NavLink, useLocation } from 'react-router-dom';

import { selectServiceNamespaces, selectUserIsAdmin, selectUserNamespace } from '@app/store';

import { Nav, NavList, NavItem, NavExpandable } from '@patternfly/react-core';

const Navigation: React.FunctionComponent = () => {
  const location = useLocation();
  const serviceNamespaces = useSelector(selectServiceNamespaces);
  const userNamespace = useSelector(selectUserNamespace);
  const userIsAdmin = useSelector(selectUserIsAdmin);

  const catalogNavigation = (
    <NavItem>
      <NavLink activeClassName="pf-m-current" to="/catalog">
        Catalog
      </NavLink>
    </NavItem>
  );

  const serviceNavigation =
    userIsAdmin || serviceNamespaces.length > 1 ? (
      <NavExpandable title="Services" isExpanded={location.pathname.startsWith('/services')}>
        <NavItem>
          <NavLink
            activeClassName="pf-m-current"
            to="/services"
            isActive={(match, location): boolean =>
              match && !location.pathname.startsWith(`/services/${userNamespace.name}`)
            }
          >
            All Services
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink activeClassName="pf-m-current" to={`/services/${userNamespace.name}`}>
            My Services
          </NavLink>
        </NavItem>
      </NavExpandable>
    ) : (
      <NavItem>
        <NavLink activeClassName="pf-m-current" to="/services">
          Services
        </NavLink>
      </NavItem>
    );

  const adminNavigation = (
    <NavExpandable title="Admin" isExpanded={location.pathname.startsWith('/admin/')}>
      <NavItem>
        <NavLink activeClassName="pf-m-current" to="/admin/anarchyactions">
          AnarchyActions
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink activeClassName="pf-m-current" to="/admin/anarchygovernors">
          AnarchyGovernors
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink activeClassName="pf-m-current" to="/admin/anarchyruns">
          AnarchyRuns
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink activeClassName="pf-m-current" to="/admin/anarchysubjects">
          AnarchySubjects
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink activeClassName="pf-m-current" to="/admin/resourcehandles">
          ResourceHandles
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink activeClassName="pf-m-current" to="/admin/resourcepools">
          ResourcePools
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink activeClassName="pf-m-current" to="/admin/resourceproviders">
          ResourceProviders
        </NavLink>
      </NavItem>
    </NavExpandable>
  );

  return (
    <Nav id="nav-primary-simple" theme="dark">
      <NavList id="nav-list-simple">
        {catalogNavigation}
        {serviceNavigation}
        {userIsAdmin ? adminNavigation : null}
      </NavList>
    </Nav>
  );
};

export default Navigation;
