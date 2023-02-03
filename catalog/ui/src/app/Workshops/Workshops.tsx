import React from 'react';
import { useParams } from 'react-router-dom';

const WorkshopsItem = React.lazy(() => import('@app/Workshops/WorkshopsItem'));
const WorkshopsList = React.lazy(() => import('@app/Workshops/WorkshopsList'));

const Workshops: React.FunctionComponent = () => {
  const { name, namespace, tab = 'details' } = useParams();
  if (name && name.trim() !== '') {
    return <WorkshopsItem activeTab={tab} serviceNamespaceName={namespace} workshopName={name} />;
  } else {
    return <WorkshopsList serviceNamespaceName={namespace} />;
  }
};

export default Workshops;
