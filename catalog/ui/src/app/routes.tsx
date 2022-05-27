import React from 'react';
import { Route, RouteComponentProps, Switch } from 'react-router-dom';
import { Spinner } from '@patternfly/react-core';

const Dashboard = React.lazy(() => import('@app/Dashboard/Dashboard'));
const Catalog = React.lazy(() => import('@app/Catalog/Catalog'));
const Services = React.lazy(() => import('@app/Services/Services'));
const Workshops = React.lazy(() => import('@app/Workshops/Workshops'));
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
import { useDocumentTitle } from '@app/utils/useDocumentTitle';
import useSession from '@app/utils/useSession';
export interface IAppRoute {
  label?: string; // Excluding the label will exclude the route from the nav sidebar in AppLayout
  /* eslint-disable @typescript-eslint/no-explicit-any */
  component: React.ComponentType<RouteComponentProps<any>> | React.ComponentType<any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  exact?: boolean;
  path: string;
  title: string;
  isAsync?: boolean;
  routes?: undefined;
  adminRoutes?: undefined;
}

export interface IAppRouteGroup {
  label: string;
  routes: IAppRoute[];
  adminRoutes: IAppRoute[];
}

export type AppRouteConfig = IAppRoute | IAppRouteGroup;

const routes: AppRouteConfig[] = [
  {
    component: Dashboard,
    exact: true,
    //label: 'Dashboard',
    path: '/',
    title: 'Babylon | Dashboard',
  },
  {
    label: 'Catalog',
    component: Catalog,
    path: '/catalog',
    title: 'Babylon | Catalog',
  },
  {
    label: 'Services',
    component: Services,
    path: '/services',
    title: 'Babylon | Services',
  },
  {
    label: 'Workshops',
    component: Workshops,
    path: '/workshops',
    title: 'Babylon | Workshops',
  },
  /*
  {
    component: Support,
    exact: true,
    isAsync: true,
    label: 'Support',
    path: '/support',
    title: 'Babylon | Support Page',
  },
*/
];

const adminRoutes: AppRouteConfig[] = [
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
    label: 'AnarchyActions',
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
    label: 'AnarchyGovernors',
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
    label: 'AnarchyRuns',
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
    label: 'AnarchySubjects',
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
    label: 'ResourceHandles',
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
    label: 'ResourcePools',
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
    label: 'ResourceProviders',
    component: ResourceProviders,
    path: '/admin/resourceproviders',
    title: 'Babylon | Admin',
  },
];

const RouteWithTitleUpdates = ({ component: Component, isAsync = false, title, ...rest }: IAppRoute) => {
  useDocumentTitle(title);

  function routeWithTitle(routeProps: RouteComponentProps) {
    return <Component {...rest} {...routeProps} />;
  }

  return <Route render={routeWithTitle} />;
};

const PageNotFound = ({ title }: { title: string }) => {
  useDocumentTitle(title);
  return <Route component={NotFound} />;
};

const flattenedRoutes: IAppRoute[] = routes.reduce(
  (flattened, route) => [...flattened, ...(route.routes ? route.routes : [route])] as any,
  [] as IAppRoute[]
);

const adminFlattenedRoutes: IAppRoute[] = adminRoutes.reduce(
  (adminFlattenedRoutes, route) =>
    [...adminFlattenedRoutes, ...(route.adminRoutes ? route.adminRoutes : [route])] as any,
  [] as IAppRoute[]
);

const AppRoutes = (): React.ReactElement => {
  const { isAdmin, userInterface } = useSession().getSession();

  return (
    <React.Suspense fallback={<Spinner isSVG size="lg" />}>
      <Switch>
        {flattenedRoutes.map(({ path, exact, component, title, isAsync }: any, idx) => {
          const pageTitle =
            userInterface === 'summit'
              ? title.replace('Babylon', 'Red Hat Summit')
              : userInterface === 'rhpds'
              ? title.replace('Babylon', 'RHPDS')
              : title;
          return (
            <RouteWithTitleUpdates
              path={path}
              exact={exact}
              component={component}
              key={idx}
              title={pageTitle}
              isAsync={isAsync}
            />
          );
        })}
        {isAdmin
          ? adminFlattenedRoutes.map(({ path, exact, component, title, isAsync }: any, idx) => {
              const pageTitle =
                userInterface === 'summit'
                  ? title.replace('Babylon', 'Red Hat Summit')
                  : userInterface === 'rhpds'
                  ? title.replace('Babylon', 'RHPDS')
                  : title;
              return (
                <RouteWithTitleUpdates
                  path={path}
                  exact={exact}
                  component={component}
                  key={idx}
                  title={pageTitle}
                  isAsync={isAsync}
                />
              );
            })
          : null}
        <PageNotFound title="404 Page Not Found" />
      </Switch>
    </React.Suspense>
  );
};

export { AppRoutes, routes, adminRoutes };
