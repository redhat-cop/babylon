import * as React from 'react';
import { useLocation, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux'
import { LastLocationProvider, useLastLocation } from 'react-router-last-location';

import { Spinner } from "@patternfly/react-core";

import { selectInterface, actionSetActiveServiceNamespace } from '@app/store';
import { accessibleRouteChangeHandler } from '@app/utils/utils';
const Dashboard = React.lazy(() => import('@app/Dashboard/Dashboard'));
const Catalog = React.lazy(() => import('@app/Catalog/Catalog'));
const CatalogRequest = React.lazy(() => import('@app/Catalog/Request/CatalogRequest'));
const Services = React.lazy(() => import('@app/Services/Services'));
const ServicesItem = React.lazy(() => import('@app/Services/Item/ServicesItem'));
const NotFound = React.lazy(() => import('@app/NotFound/NotFound'));
import { useDocumentTitle } from '@app/utils/useDocumentTitle';

let routeFocusTimer: number;
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
}

export interface IAppRouteGroup {
  label: string;
  routes: IAppRoute[];
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
    // Catalog item from specific namespace
    component: CatalogRequest,
    exact: true,
    path: '/catalog/request/:namespace/:name',
    title: 'Babylon | Catalog',
  },
  {
    label: 'Catalog',
    component: Catalog,
    path: '/catalog',
    title: 'Babylon | Catalog',
  },
  {
    component: ServicesItem,
    path: '/services/ns/:namespace/item/:name',
    title: 'Babylon | Services',
  },
  {
    component: ServicesItem,
    path: '/services/item/:namespace/:name',
    title: 'Babylon | Services',
  },
  {
    label: 'Services',
    component: Services,
    path: '/services',
    title: 'Babylon | Services',
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

// a custom hook for sending focus to the primary content container
// after a view has loaded so that subsequent press of tab key
// sends focus directly to relevant content
const useA11yRouteChange = (isAsync: boolean) => {
  const lastNavigation = useLastLocation();
  React.useEffect(() => {
    if (!isAsync && lastNavigation !== null) {
      routeFocusTimer = accessibleRouteChangeHandler();
    }
    return () => {
      window.clearTimeout(routeFocusTimer);
    };
  }, [isAsync, lastNavigation]);
};

const RouteWithTitleUpdates = ({ component: Component, isAsync = false, title, ...rest }: IAppRoute) => {
  useA11yRouteChange(isAsync);
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

const flattenedRoutes: AppRouteConfig[] = routes.reduce(
  (flattened, route) => [...flattened, ...(route.routes ? route.routes : [route])],
  [] as AppRouteConfig[]
);

const AppRoutes = (): React.ReactElement => {
  const userInterface = useSelector(selectInterface);
  const dispatch = useDispatch();
  const location = useLocation();

  if (location.pathname.startsWith('/services/ns/') || location.pathname.startsWith('/services/item/')) {
    dispatch(actionSetActiveServiceNamespace(location.pathname.split('/')[3]));
  } else if(location.pathname.startsWith('/services')) {
    dispatch(actionSetActiveServiceNamespace('*'));
  } else {
    dispatch(actionSetActiveServiceNamespace(null));
  }

  return (
    <LastLocationProvider>
      <React.Suspense fallback={<Spinner isSVG size="lg"/>}>
        <Switch>
          {flattenedRoutes.map(({ path, exact, component, title, isAsync }: any, idx) => {
            const pageTitle = (
              userInterface === 'summit' ? title.replace('Babylon', 'Red Hat Summit') :
              userInterface === 'rhpds' ? title.replace('Babylon', 'RHPDS') : title
            );
            return (
              <RouteWithTitleUpdates
                path={path}
                exact={exact}
                component={component}
                key={idx}
                title={pageTitle}
                isAsync={isAsync}
              />
            )
          })}
          <PageNotFound title="404 Page Not Found" />
        </Switch>
      </React.Suspense>
    </LastLocationProvider>
  );
}

export { AppRoutes, routes };
