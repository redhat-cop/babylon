import React from 'react';
import { LinkProps, NavLink, useLocation, useMatch, useResolvedPath } from 'react-router-dom';
import { Nav, NavList, NavItem, NavExpandable } from '@patternfly/react-core';
import useSession from '@app/utils/useSession';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';
import PilotBadge from '@app/components/PilotBadge';

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
  const { incidents_enabled, ratings_enabled, multiworkshops_enabled, partner_connect_header_enabled } = useInterfaceConfig();
  const { isAdmin, userNamespace } = useSession().getSession();

  function locationStartsWith(str: string): boolean {
    return location.pathname.startsWith(str);
  }

  const catalogNavigation = (
    <NavExpandable title="Explore Content" isExpanded={locationStartsWith('/catalog')}>
      <NavItem>
        <NavLink
          className={locationStartsWith('/catalog') ? 'pf-m-current' : ''}
          to="/catalog"
        >
          Catalog
        </NavLink>
      </NavItem>
      <NavItem>
        <a
          href="https://www.redhat.com/en/interactive-experiences"
          target="_blank"
          rel="noreferrer noopener"
          className="pf-v6-c-nav__link"
        >
          Interactive Experiences
        </a>
      </NavItem>
      <NavItem>
        <a
          href="https://www.redhat.com/architect/portfolio/"
          target="_blank"
          rel="noreferrer noopener"
          className="pf-v6-c-nav__link"
        >
          Architecture Center
        </a>
      </NavItem>
      {!partner_connect_header_enabled ? (
        <NavItem>
          <a
            href="https://litellm-prod-frontend.apps.maas.redhatworkshops.io/"
            target="_blank"
            rel="noreferrer noopener"
            className="pf-v6-c-nav__link"
          >
            Model-as-a-Service (MaaS)
          </a>
        </NavItem>
      ) : null}
    </NavExpandable>
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
        My Services
      </NavLink>
    </NavItem>
  ) : null;

  const activityNavigation = (
    <NavItem>
      <NavLink
        to="/activity"
        className={locationStartsWith('/activity') ? 'pf-m-current' : ''}
      >
        My Activity
      </NavLink>
    </NavItem>
  );

  const multiWorkshopNavigation = userNamespace && multiworkshops_enabled ? (
    <NavItem>
      <NavLink
        to={`/multi-workshop/${userNamespace.name}`}
        className={locationStartsWith('/multi-workshop/') ? 'pf-m-current' : ''}
      >
        <span style={{ display: 'flex', alignItems: 'center' }}>
                    Multi Asset Workshop
          <PilotBadge />
        </span>
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
      {ratings_enabled ? (
        <NavItem>
          <NavLink className={locationStartsWith('/admin/ratings') ? 'pf-m-current' : ''} to="/admin/ratings">
            Ratings
          </NavLink>
        </NavItem>
      ) : null}
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
        <ExactNavLink className={locationStartsWith('/admin/multiworkshops') ? 'pf-m-current' : ''} to="/admin/multiworkshops">
          Multi-Workshops
        </ExactNavLink>
      </NavItem>
      <NavItem>
        <ExactNavLink
          className={locationStartsWith('/admin/scheduled/workshops') ? 'pf-m-current' : ''}
          to="/admin/scheduled/workshops"
        >
          Scheduled Workshops
        </ExactNavLink>
      </NavItem>
      <NavItem>
        <ExactNavLink
          className={locationStartsWith('/admin/system-status') ? 'pf-m-current' : ''}
          to="/admin/system-status"
        >
          System Status
        </ExactNavLink>
      </NavItem>
      {incidents_enabled ? (
        <NavItem>
          <ExactNavLink className={locationStartsWith('/admin/incidents') ? 'pf-m-current' : ''} to="/admin/incidents">
            Incidents
          </ExactNavLink>
        </NavItem>
      ) : null}
    </NavExpandable>
  ) : null;

  return (
    <Nav id="nav-primary-simple" >
      <NavList id="nav-list-simple">
        {catalogNavigation}
        {serviceNavigation}
        {activityNavigation}
        {multiWorkshopNavigation}
        {adminNavigation}
      </NavList>
    </Nav>
  );
};

export default Navigation;
