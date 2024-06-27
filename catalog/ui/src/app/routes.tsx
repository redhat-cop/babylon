import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { IAppRoute } from './types';
import AppLayout from './AppLayout/AppLayout';
import { ErrorBoundary } from 'react-error-boundary';
import LoadingSection from './components/LoadingSection';

const Dashboard = React.lazy(() => import('@app/Dashboard'));
const CatalogRedirections = React.lazy(() => import('@app/Catalog/CatalogRedirections'));
const CatalogItemForm = React.lazy(() => import('@app/Catalog/CatalogItemForm'));
const Services = React.lazy(() => import('@app/Services/Services'));
const ResourceClaims = React.lazy(() => import('@app/Admin/ResourceClaims'));
const WorkshopsList = React.lazy(() => import('@app/Admin/Workshops'));
const WorkshopsScheduled = React.lazy(() => import('@app/Admin/WorkshopsScheduled'));
const WorkshopsItem = React.lazy(() => import('@app/Workshops/WorkshopsItem'));
const Workshop = React.lazy(() => import('@app/Workshop/Workshop'));
const SupportPage = React.lazy(() => import('@app/Support/SupportPage'));
const NotFound = React.lazy(() => import('@app/NotFound/NotFound'));
const IncidentsPage = React.lazy(() => import('@app/Admin/IncidentsPage'));
const RatingsPage = React.lazy(() => import('@app/Admin/RatingsPage'));
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

const appRoutes: IAppRoute[] = [
  {
    component: Dashboard,
    path: '/',
    title: 'Babylon | Dashboard',
  },
  {
    component: CatalogItemForm,
    path: '/catalog/:namespace/order/:name',
    title: 'Babylon | Catalog',
  },
  {
    component: CatalogRedirections,
    path: '/catalog/:namespace',
    title: 'Babylon | Catalog',
  },
  {
    component: CatalogRedirections,
    path: '/catalog',
    title: 'Babylon | Catalog',
  },
  {
    component: Services,
    path: '/services/:namespace/:name/:tab',
    title: 'Babylon | Services',
  },
  {
    component: Services,
    path: '/services/:namespace/:name',
    title: 'Babylon | Services',
  },
  {
    component: Services,
    path: '/services/:namespace',
    title: 'Babylon | Services',
  },
  {
    component: Services,
    path: '/services',
    title: 'Babylon | Services',
  },
  {
    component: WorkshopsItem,
    path: '/workshops/:namespace/:name/:tab',
    title: 'Babylon | Workshops',
  },
  {
    component: WorkshopsItem,
    path: '/workshops/:namespace/:name',
    title: 'Babylon | Workshops',
  },
  {
    component: ResourceClaims,
    path: '/admin/resourceclaims/:namespace',
    title: 'Babylon | ResourceClaims',
  },
  {
    component: ResourceClaims,
    path: '/admin/resourceclaims',
    title: 'Babylon | ResourceClaims',
  },
  {
    component: WorkshopsScheduled,
    path: '/admin/scheduled/workshops',
    title: 'Babylon | Scheduled Workshops',
  },
  {
    component: WorkshopsScheduled,
    path: '/admin/scheduled/workshops/:namespace',
    title: 'Babylon | Scheduled Workshops',
  },
  {
    component: WorkshopsList,
    path: '/admin/workshops/:namespace',
    title: 'Babylon | Workshops',
  },
  {
    component: WorkshopsList,
    path: '/admin/workshops',
    title: 'Babylon | Workshops',
  },

  {
    component: AnarchyActionInstance,
    path: '/admin/anarchyactions/:namespace/:name/:tab',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchyActionInstance,
    path: '/admin/anarchyactions/:namespace/:name',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchyActions,
    path: '/admin/anarchyactions/:namespace',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchyActions,
    path: '/admin/anarchyactions',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchyGovernorInstance,
    path: '/admin/anarchygovernors/:namespace/:name/:tab',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchyGovernorInstance,
    path: '/admin/anarchygovernors/:namespace/:name',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchyGovernors,
    path: '/admin/anarchygovernors/:namespace',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchyGovernors,
    path: '/admin/anarchygovernors',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchyRunInstance,
    path: '/admin/anarchyruns/:namespace/:name/:tab',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchyRunInstance,
    path: '/admin/anarchyruns/:namespace/:name',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchyRuns,
    path: '/admin/anarchyruns/:namespace',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchyRuns,
    path: '/admin/anarchyruns',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchySubjectInstance,
    path: '/admin/anarchysubjects/:namespace/:name/:tab',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchySubjectInstance,
    path: '/admin/anarchysubjects/:namespace/:name',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchySubjects,
    path: '/admin/anarchysubjects/:namespace',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: AnarchySubjects,
    path: '/admin/anarchysubjects',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: ResourceHandleInstance,
    path: '/admin/resourcehandles/:name/:tab',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: ResourceHandleInstance,
    path: '/admin/resourcehandles/:name',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: ResourceHandles,
    path: '/admin/resourcehandles',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: ResourcePoolInstance,
    path: '/admin/resourcepools/:name/:tab',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: ResourcePoolInstance,
    path: '/admin/resourcepools/:name',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: ResourcePools,
    path: '/admin/resourcepools',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: ResourceProviderInstance,
    path: '/admin/resourceproviders/:name/:tab',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: ResourceProviderInstance,
    path: '/admin/resourceproviders/:name',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: ResourceProviders,
    path: '/admin/resourceproviders',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: CatalogItemAdmin,
    path: '/admin/catalogitems/:namespace/:name',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: IncidentsPage,
    path: '/admin/incidents',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
  {
    component: RatingsPage,
    path: '/admin/ratings',
    title: 'Babylon | Admin',
    accessControl: 'admin',
  },
];
const publicRoutes: IAppRoute[] = [
  {
    component: Workshop,
    path: '/workshop/:workshopId',
    title: 'Workshop | Babylon',
  },
  {
    component: SupportPage,
    path: '/support',
    title: 'Solution Support: Service Level | Babylon',
  },
];

const _Routes: React.FC = () => {
  return (
    <Routes>
      {publicRoutes.map(({ path, component: Component, title }: IAppRoute, idx) => (
        <Route
          path={path}
          element={
            <Suspense fallback={<LoadingSection />}>
              <ErrorBoundary
                FallbackComponent={NotFound}
                onError={(err) => window['newrelic'] && window['newrelic'].noticeError(err)}
              >
                <Component title={title} />
              </ErrorBoundary>
            </Suspense>
          }
          key={`public-routes-${idx}`}
        />
      ))}
      {appRoutes.map(({ path, component: Component, title, accessControl }: IAppRoute, idx) => (
        <Route
          path={path}
          key={`app-routes-${idx}`}
          element={
            <AppLayout title={title} accessControl={accessControl}>
              <Suspense fallback={<LoadingSection />}>
                <ErrorBoundary
                  FallbackComponent={NotFound}
                  onError={(err) => window['newrelic'] && window['newrelic'].noticeError(err)}
                >
                  <Component />
                </ErrorBoundary>
              </Suspense>
            </AppLayout>
          }
        />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default _Routes;
