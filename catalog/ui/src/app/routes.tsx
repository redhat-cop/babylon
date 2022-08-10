import React from 'react';
import { Route, Switch } from 'react-router-dom';
import useDocumentTitle from '@app/utils/useDocumentTitle';
import { IAppRoute } from './types';
import useSession from './utils/useSession';
import AppLayout from './AppLayout/AppLayout';
import { ErrorBoundary } from 'react-error-boundary';

const Dashboard = React.lazy(() => import('@app/Dashboard'));
const Catalog = React.lazy(() => import('@app/Catalog/Catalog'));
const CatalogItemForm = React.lazy(() => import('@app/Catalog/CatalogItemForm'));
const TechnicalSupportPage = React.lazy(() => import('@app/TechnicalSupportPage'));
const Services = React.lazy(() => import('@app/Services/Services'));
const Workshops = React.lazy(() => import('@app/Workshops/Workshops'));
const Workshop = React.lazy(() => import('@app/Workshop/Workshop'));
const NotFound = React.lazy(() => import('@app/NotFound/NotFound'));
const AnarchyActionInstance = React.lazy(() => import('@app/Admin/AnarchyActionInstance'));
const AnarchyActions = React.lazy(() => import('@app/Admin/AnarchyActions'));
const AnarchyGovernorInstance = React.lazy(() => import('@app/Admin/AnarchyGovernorInstance'));
const AnarchyGovernors = React.lazy(() => import('@app/Admin/AnarchyGovernors'));
const AnarchyRunInstance = React.lazy(() => import('@app/Admin/AnarchyRunInstance'));
const AnarchyRuns = React.lazy(() => import('@app/Admin/AnarchyRuns'));
const AnarchySubjectInstance = React.lazy(() => import('@app/Admin/AnarchySubjectInstance'));
const AnarchySubjects = React.lazy(() => import('@app/Admin/AnarchySubjects'));
const ResourceHandles = React.lazy(() => import('@app/Admin/ResourceHandles'));
const ResourceHandleInstance = React.lazy(() => import('@app/Admin/ResourceHandleInstance'));
const ResourcePools = React.lazy(() => import('@app/Admin/ResourcePools'));
const ResourcePoolInstance = React.lazy(() => import('@app/Admin/ResourcePoolInstance'));
const ResourceProviders = React.lazy(() => import('@app/Admin/ResourceProviders'));
const ResourceProviderInstance = React.lazy(() => import('@app/Admin/ResourceProviderInstance'));
const CatalogItemAdmin = React.lazy(() => import('@app/Admin/CatalogItemAdmin'));

function getPageTitle(title: string, userInterface: string): string {
  return userInterface === 'summit'
    ? title.replace('Babylon', 'Red Hat Summit')
    : userInterface === 'rhpds'
    ? title.replace('Babylon', 'RHPDS')
    : title;
}
const appRoutes: IAppRoute[] = [
  {
    component: Dashboard,
    exact: true,
    path: '/',
    title: 'Babylon | Dashboard',
  },
  {
    component: CatalogItemForm,
    exact: true,
    path: '/catalog/:namespace/order/:catalogItem',
    title: 'Babylon | Catalog',
  },
  {
    component: Catalog,
    path: '/catalog/:namespace?',
    title: 'Babylon | Catalog',
  },
  {
    component: Services,
    exact: true,
    path: '/services/:namespace/:name?/:tab?',
    title: 'Babylon | Services',
  },
  {
    component: Services,
    exact: true,
    path: '/services',
    title: 'Babylon | Services',
  },
  {
    component: Workshops,
    path: '/workshops',
    title: 'Babylon | Workshops',
  },
];

const adminRoutes: IAppRoute[] = [
  {
    component: AnarchyActionInstance,
    path: '/admin/anarchyactions/:namespace/:name',
    title: 'Babylon | Admin',
  },
  {
    component: AnarchyActions,
    path: '/admin/anarchyactions/:namespace',
    title: 'Babylon | Admin',
  },
  {
    exact: true,
    component: AnarchyActions,
    path: '/admin/anarchyactions',
    title: 'Babylon | Admin',
  },
  {
    component: AnarchyGovernorInstance,
    path: '/admin/anarchygovernors/:namespace/:name',
    title: 'Babylon | Admin',
  },
  {
    component: AnarchyGovernors,
    path: '/admin/anarchygovernors/:namespace',
    title: 'Babylon | Admin',
  },
  {
    exact: true,
    component: AnarchyGovernors,
    path: '/admin/anarchygovernors',
    title: 'Babylon | Admin',
  },
  {
    component: AnarchyRunInstance,
    path: '/admin/anarchyruns/:namespace/:name',
    title: 'Babylon | Admin',
  },
  {
    component: AnarchyRuns,
    path: '/admin/anarchyruns/:namespace',
    title: 'Babylon | Admin',
  },
  {
    exact: true,
    component: AnarchyRuns,
    path: '/admin/anarchyruns',
    title: 'Babylon | Admin',
  },
  {
    component: AnarchySubjectInstance,
    path: '/admin/anarchysubjects/:namespace/:name',
    title: 'Babylon | Admin',
  },
  {
    component: AnarchySubjects,
    path: '/admin/anarchysubjects/:namespace',
    title: 'Babylon | Admin',
  },
  {
    component: AnarchySubjects,
    path: '/admin/anarchysubjects',
    title: 'Babylon | Admin',
  },
  {
    component: ResourceHandleInstance,
    path: '/admin/resourcehandles/:name',
    title: 'Babylon | Admin',
  },
  {
    component: ResourceHandles,
    path: '/admin/resourcehandles',
    title: 'Babylon | Admin',
  },
  {
    component: ResourcePoolInstance,
    path: '/admin/resourcepools/:name',
    title: 'Babylon | Admin',
  },
  {
    component: ResourcePools,
    path: '/admin/resourcepools',
    title: 'Babylon | Admin',
  },
  {
    component: ResourceProviderInstance,
    path: '/admin/resourceproviders/:name',
    title: 'Babylon | Admin',
  },
  {
    component: ResourceProviders,
    path: '/admin/resourceproviders',
    title: 'Babylon | Admin',
  },
  {
    component: CatalogItemAdmin,
    path: '/admin/catalogitems/:namespace/:name',
    title: 'Babylon | Admin',
  },
];

const publicRoutes: IAppRoute[] = [
  {
    component: TechnicalSupportPage,
    exact: true,
    path: '/technical-support/:supportType?',
    title: 'Technical Support | Babylon',
  },
  {
    component: Workshop,
    exact: true,
    path: '/workshop/:workshopId',
    title: 'Workshop | Babylon',
  },
];

const RouteWithTitleUpdates = ({ children, title, path, exact, ...rest }: any): JSX.Element => {
  useDocumentTitle(title);
  return (
    <Route exact={exact} path={path} {...rest}>
      {children}
    </Route>
  );
};

const PageNotFound = ({ title }: { title: string }): JSX.Element => {
  useDocumentTitle(title);
  return <Route component={NotFound} />;
};

const RoutesSwitch: React.FC = () => {
  const { isAdmin, userInterface } = useSession().getSession();
  return (
    <Switch>
      {publicRoutes.map(({ path, exact, component, title }: IAppRoute, idx) => {
        const pageTitle = getPageTitle(title, userInterface);
        return <RouteWithTitleUpdates path={path} exact={exact} component={component} key={idx} title={pageTitle} />;
      })}
      {appRoutes.map(({ path, exact, component: Component, title }: IAppRoute, idx) => {
        const pageTitle = getPageTitle(title, userInterface);
        return (
          <RouteWithTitleUpdates path={path} exact={exact} key={idx} title={pageTitle}>
            <AppLayout key={`app-routes-${idx}`}>
              <ErrorBoundary FallbackComponent={NotFound}>
                <Component />
              </ErrorBoundary>
            </AppLayout>
          </RouteWithTitleUpdates>
        );
      })}

      {isAdmin
        ? adminRoutes.map(({ path, exact, component: Component, title }: IAppRoute, idx) => {
            const pageTitle = getPageTitle(title, userInterface);
            return (
              <RouteWithTitleUpdates path={path} exact={exact} key={idx} title={pageTitle}>
                <AppLayout key={`admin-routes-${idx}`}>
                  <ErrorBoundary FallbackComponent={NotFound}>
                    <Component />
                  </ErrorBoundary>
                </AppLayout>
              </RouteWithTitleUpdates>
            );
          })
        : null}
      <PageNotFound title="404 Page Not Found" />
    </Switch>
  );
};

export default RoutesSwitch;
