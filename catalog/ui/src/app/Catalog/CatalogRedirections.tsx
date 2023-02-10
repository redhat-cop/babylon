import React, { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useSession from '@app/utils/useSession';
import Catalog from './Catalog';
import { getLastFilter } from './catalog-utils';

const CatalogRedirections: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { catalogNamespaces, groups } = useSession().getSession();
  const { namespace: catalogNamespaceName } = useParams();
  const userHasRequiredPropertiesToAccess =
    catalogNamespaces.length > 0 &&
    groups.some((g) => g.startsWith('identity-provider')) &&
    groups.some((g) => g.startsWith('email-domain'));

  // Load last filter
  useEffect(() => {
    const lastFilter = new URLSearchParams(getLastFilter());
    if (lastFilter.has('catalog')) {
      const lastCatalogNamespaceName = lastFilter.get('catalog');
      lastFilter.delete('catalog');
      if (!catalogNamespaceName) {
        const filter = lastFilter.toString() ? `?${lastFilter.toString()}` : '';
        return navigate(`/catalog/${lastCatalogNamespaceName}${filter}`, { replace: true });
      }
    }
    if (!searchParams.toString() && lastFilter) {
      setSearchParams(lastFilter);
    }
  }, [searchParams.toString(), setSearchParams]);

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
