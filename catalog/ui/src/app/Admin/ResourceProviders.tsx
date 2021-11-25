import React from "react";
import { useEffect, useState } from "react";
import { useSelector } from 'react-redux';
import { getResourceProviders } from '@app/api';
import { selectConsoleURL } from '@app/store';
import { TableList } from '@app/components/TableList';

const ResourceProviders: React.ComponentType<any> = () => {
  const [resourceProvidersList, setResourceProviders] = useState([] as any);
  const consoleURL = useSelector(selectConsoleURL);

  const columns = ["Name"];
  const rows = [];

  async function fetchResourceProviders() {
    try {
      const resp = await getResourceProviders();
      const resourceProviders = resp.items;
      for (const resourceProvider of resourceProviders) {
        const name = <React.Fragment><a href={`${consoleURL}/k8s/ns/${resourceProvider.metadata.namespace}/poolboy.gpte.redhat.com~v1~ResourceProvider/${resourceProvider.metadata.name}`} target="_blank">{resourceProvider.metadata.name}</a></React.Fragment>;

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
