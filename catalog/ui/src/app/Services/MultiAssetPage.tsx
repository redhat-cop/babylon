import React from 'react';
import NotFound from '@app/NotFound/NotFound';
import { useParams } from 'react-router-dom';

const MultiAsset = React.lazy(() => import('@app/Services/MultiAsset'));

const MultiAssetPage: React.FC = () => {
  const { namespace, multiasset } = useParams();
  if (!namespace || !multiasset) {
    return <NotFound />;
  }
  return <MultiAsset namespace={namespace} multiAsset={multiasset} />;
};

export default MultiAssetPage;
