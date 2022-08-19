import * as React from 'react';
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
  const { isAdmin, userNamespace, serviceNamespaces, workshopNamespaces } = useSession().getSession();

  function locationStartsWith(str: string): boolean {
    return location.pathname.includes(str);
  }

  const catalogNavigation = (
    <NavItem>
      <NavLink className={locationStartsWith('/catalog') ? 'pf-m-current' : ''} to="/catalog">
        Catalog
      </NavLink>
    </NavItem>
  );

  const serviceNavigation =
    isAdmin || serviceNamespaces.length > 1 ? (
      <NavExpandable title="Services" isExpanded={locationStartsWith('/services')}>
        <NavItem>
          <NavLink
            to={`/services/${userNamespace.name}`}
            className={locationStartsWith(`/services/${userNamespace.name}`) ? 'pf-m-current' : ''}
          >
            My Services
          </NavLink>
        </NavItem>
        <NavItem>
          <ExactNavLink to="/services">All Services</ExactNavLink>
        </NavItem>
      </NavExpandable>
    ) : (
      <NavItem>
        <NavLink
          className={locationStartsWith(`/services/${userNamespace.name}`) ? 'pf-m-current' : ''}
          to={`/services/${userNamespace.name}`}
        >
          Services
        </NavLink>
      </NavItem>
    );

  const workshopNavigation =
    isAdmin || workshopNamespaces.length > 1 ? (
      <NavExpandable title="Workshops" isExpanded={locationStartsWith('/workshops')}>
        <NavItem>
          <NavLink
            className={locationStartsWith(`/workshops/${userNamespace.name}`) ? 'pf-m-current' : ''}
            to={`/workshops/${userNamespace.name}`}
          >
            My Workshops
          </NavLink>
        </NavItem>
        <NavItem>
          <ExactNavLink to="/workshops">All Workshops</ExactNavLink>
        </NavItem>
      </NavExpandable>
    ) : workshopNamespaces.length > 0 ? (
      <NavItem>
        <NavLink
          className={locationStartsWith(`/workshops/${userNamespace.name}`) ? 'pf-m-current' : ''}
          to={`/workshops/${userNamespace.name}`}
        >
          Workshops
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
