import React from 'react';
import { useRouteMatch } from 'react-router-dom';

const ServicesItem = React.lazy(() => import('@app/Services/ServicesItem'));
const ServicesList = React.lazy(() => import('@app/Services/ServicesList'));

const Services: React.FC = () => {
  const routeMatch = useRouteMatch<any>('/services/:namespace?/:name?/:tab?');
  if (routeMatch.params.name) {
    return (
      <ServicesItem
        activeTab={routeMatch.params.tab || 'details'}
        resourceClaimName={routeMatch.params.name}
        serviceNamespaceName={routeMatch.params.namespace}
      />
    );
  }
  return <ServicesList serviceNamespaceName={routeMatch.params.namespace} />;
};

export default Services;
