import React from 'react';
import { useParams } from 'react-router-dom';

const ServicesListLight = React.lazy(() => import('@app/Services/ServicesListLight'));

const ServicesLight: React.FC = () => {
  const { namespace } = useParams();
  return <ServicesListLight serviceNamespaceName={namespace} />;
};

export default ServicesLight;
