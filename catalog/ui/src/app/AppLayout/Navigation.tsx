import React from 'react';
import { LinkProps, NavLink, useLocation, useMatch, useResolvedPath } from 'react-router-dom';
import { Nav, NavList, NavItem, NavExpandable } from '@patternfly/react-core';
import useSession from '@app/utils/useSession';

const ExactNavLink = ({ children, to, className, ...props }: LinkProps) => {
  const resolved = useResolvedPath(to);
  const match = useMatch({ path: resolved.pathname, end: true });

  if (match) {
    className = className + ' pf-m-current';
  }
  return (
    <NavLink to={to} className={className} {...props}>
      {children}
    </NavLink>
  );
};
const Navigation: React.FC = () => {
  const location = useLocation();
  const { isAdmin, userNamespace } = useSession().getSession();

  function locationStartsWith(str: string): boolean {
    return location.pathname.startsWith(str);
  }

  const catalogNavigation = (
    <NavItem>
      <NavLink className={locationStartsWith('/catalog') ? 'pf-m-current' : ''} to="/catalog">
        Catalog
      </NavLink>
    </NavItem>
  );

  const serviceNavigation = userNamespace ? (
    <NavItem>
      <NavLink
        to={`/services/${userNamespace.name}`}
        className={
          location.pathname.match(/\/services\/[a-zA-Z0-9_.-]/) ||
          location.pathname.match(/\/workshops\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/)
            ? 'pf-m-current'
            : ''
        }
      >
        Services
      </NavLink>
    </NavItem>
  ) : null;

  const adminNavigation = isAdmin ? (
    <NavExpandable title="Admin" isExpanded={locationStartsWith('/admin/')}>
      <NavItem>
        <NavLink
          className={locationStartsWith('/admin/anarchyactions') ? 'pf-m-current' : ''}
          to="/admin/anarchyactions"
        >
          AnarchyActions
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink
          className={locationStartsWith('/admin/anarchygovernors') ? 'pf-m-current' : ''}
          to="/admin/anarchygovernors"
        >
          AnarchyGovernors
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink className={locationStartsWith('/admin/anarchyruns') ? 'pf-m-current' : ''} to="/admin/anarchyruns">
          AnarchyRuns
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink
          className={locationStartsWith('/admin/anarchysubjects') ? 'pf-m-current' : ''}
          to="/admin/anarchysubjects"
        >
          AnarchySubjects
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink
          className={locationStartsWith('/admin/resourceclaims') ? 'pf-m-current' : ''}
          to="/admin/resourceclaims"
        >
          ResourceClaims
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink
          className={locationStartsWith('/admin/resourcehandles') ? 'pf-m-current' : ''}
          to="/admin/resourcehandles"
        >
          ResourceHandles
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink className={locationStartsWith('/admin/resourcepools') ? 'pf-m-current' : ''} to="/admin/resourcepools">
          ResourcePools
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink
          className={locationStartsWith('/admin/resourceproviders') ? 'pf-m-current' : ''}
          to="/admin/resourceproviders"
        >
          ResourceProviders
        </NavLink>
      </NavItem>
      <NavItem>
        <ExactNavLink className={locationStartsWith('/admin/workshops') ? 'pf-m-current' : ''} to="/admin/workshops">
          Workshops
        </ExactNavLink>
      </NavItem>
      <NavItem>
        <ExactNavLink className={locationStartsWith('/admin/incidents') ? 'pf-m-current' : ''} to="/admin/incidents">
          Incidents
        </ExactNavLink>
      </NavItem>
    </NavExpandable>
  ) : null;

  return (
    <Nav id="nav-primary-simple" theme="dark">
      <NavList id="nav-list-simple">
        {catalogNavigation}
        {serviceNavigation}
        {adminNavigation}
      </NavList>
    </Nav>
  );
};

export default Navigation;
