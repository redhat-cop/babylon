import React from 'react';
import { useParams } from 'react-router-dom';

const ServicesItem = React.lazy(() => import('@app/Services/ServicesItem'));
const ServicesList = React.lazy(() => import('@app/Services/ServicesList'));

const Services: React.FC = () => {
  const { namespace, name, tab } = useParams();
  if (name) {
    return <ServicesItem activeTab={tab} resourceClaimName={name} serviceNamespaceName={namespace} />;
  }
  return <ServicesList serviceNamespaceName={namespace} />;
};

export default Services;
