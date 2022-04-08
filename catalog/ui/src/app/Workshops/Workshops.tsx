import React from "react";
import { useRouteMatch } from 'react-router-dom';

const WorkshopsItem = React.lazy(() => import('@app/Workshops/WorkshopsItem'));
const WorkshopsList = React.lazy(() => import('@app/Workshops/WorkshopsList'));

const Workshops: React.FunctionComponent = () => {
  const routeMatch = useRouteMatch<any>('/workshops/:namespace?/:name?/:tab?');
  if (routeMatch.params.name) {
    return (
      <WorkshopsItem
        activeTab={routeMatch.params.tab || 'details'}
        serviceNamespaceName={routeMatch.params.namespace}
        workshopName={routeMatch.params.name}
      />
    );
  } else {
    return (
      <WorkshopsList
        serviceNamespaceName={routeMatch.params.namespace}
      />
    );
  }
}

export default Workshops;
