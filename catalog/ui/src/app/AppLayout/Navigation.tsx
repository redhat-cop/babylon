import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Nav, NavList, NavItem, NavExpandable } from '@patternfly/react-core';
import useSession from '@app/utils/useSession';

const Navigation: React.FC = () => {
  const location = useLocation();
  const { isAdmin, userNamespace, serviceNamespaces, workshopNamespaces } = useSession().getSession();

  const catalogNavigation = (
    <NavItem>
      <NavLink activeClassName="pf-m-current" to="/catalog">
        Catalog
      </NavLink>
    </NavItem>
  );

  const serviceNavigation =
    isAdmin || serviceNamespaces.length > 1 ? (
      <NavExpandable title="Services" isExpanded={location.pathname.startsWith('/services')}>
        <NavItem>
          <NavLink activeClassName="pf-m-current" to={`/services/${userNamespace.name}`}>
            My Services
          </NavLink>
        </NavItem>
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
      </NavExpandable>
    ) : (
      <NavItem>
        <NavLink activeClassName="pf-m-current" to={`/services/${userNamespace.name}`}>
          Services
        </NavLink>
      </NavItem>
    );

  const workshopNavigation =
    isAdmin || workshopNamespaces.length > 1 ? (
      <NavExpandable title="Workshops" isExpanded={location.pathname.startsWith('/workshops')}>
        <NavItem>
          <NavLink activeClassName="pf-m-current" to={`/workshops/${userNamespace.name}`}>
            My Workshops
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink
            activeClassName="pf-m-current"
            to="/workshops"
            isActive={(match, location): boolean =>
              match && !location.pathname.startsWith(`/workshops/${userNamespace.name}`)
            }
          >
            All Workshops
          </NavLink>
        </NavItem>
      </NavExpandable>
    ) : workshopNamespaces.length > 0 ? (
      <NavItem>
        <NavLink activeClassName="pf-m-current" to={`/workshops/${userNamespace.name}`}>
          Workshops
        </NavLink>
      </NavItem>
    ) : null;

  const adminNavigation = isAdmin ? (
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
  ) : null;

  return (
    <Nav id="nav-primary-simple" theme="dark">
      <NavList id="nav-list-simple">
        {catalogNavigation}
        {serviceNavigation}
        {workshopNavigation}
        {adminNavigation}
      </NavList>
    </Nav>
  );
};

export default Navigation;
