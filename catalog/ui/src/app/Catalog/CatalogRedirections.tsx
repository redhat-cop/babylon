import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import useSession from '@app/utils/useSession';
import Catalog from './Catalog';

const CatalogRedirections: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { catalogNamespaces, groups } = useSession().getSession();
  const userHasRequiredPropertiesToAccess =
    catalogNamespaces.length > 0 && groups.some((g) => g.startsWith('identity-provider'));

  useEffect(() => {
    if (!userHasRequiredPropertiesToAccess) {
      const count = searchParams.has('c') ? parseInt(searchParams.get('c'), 10) + 1 : 1;
      setTimeout(() => {
        if (count < 6) {
          const url = new URL(window.location.href);
          url.searchParams.set('c', count.toString());
          window.location.href = url.toString();
        }
      }, 10000);
    }
  }, [userHasRequiredPropertiesToAccess, searchParams]);

  return <Catalog userHasRequiredPropertiesToAccess={userHasRequiredPropertiesToAccess} />;
};

export default CatalogRedirections;
