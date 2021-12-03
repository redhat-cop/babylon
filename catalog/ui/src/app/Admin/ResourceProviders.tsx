import React from "react";
import { useEffect, useState } from "react";
import { Link } from 'react-router-dom';
import { getResourceProviders } from '@app/api';
import { selectConsoleURL } from '@app/store';
import { TableList } from '@app/components/TableList';
import { OpenshiftConsoleLink } from './OpenshiftConsoleLink';

const ResourceProviders: React.ComponentType<any> = () => {
  const [resourceProvidersList, setResourceProviders] = useState([] as any);
  const columns = ["Name"];

  async function fetchResourceProviders() {
    try {
      const rows = [];
      const resp = await getResourceProviders();
      const resourceProviders = resp.items;
      for (const resourceProvider of resourceProviders) {
        const name = (
          <>
            <Link key="admin" to={`/admin/resourceproviders/${resourceProvider.metadata.name}`}>{resourceProvider.metadata.name}</Link>
            <OpenshiftConsoleLink key="console" resource={resourceProvider}/>
          </>
        )
        rows.push([name]);
      }
      setResourceProviders(rows);
      return rows;
    } catch (err) {
      return err;
    }
  }

  useEffect(() => {
    fetchResourceProviders()
  }, [getResourceProviders()]);

  return (
    <div>
      <h1 style={{ fontSize: "2rem", textAlign: "center", padding: "10px" }}>ResourceProviders</h1>

      {resourceProvidersList ?
        <TableList
          columns={columns}
          rows={resourceProvidersList}
        />
      : null}
    </div>
  );
}
export default ResourceProviders;
