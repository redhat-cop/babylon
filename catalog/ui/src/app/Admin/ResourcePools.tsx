import React from "react";
import { useEffect, useState } from "react";
import { useSelector } from 'react-redux';
import { getResourcePools, scalePool } from '@app/api';
import { selectConsoleURL } from '@app/store';
import { TableList } from '@app/components/TableList';
import { DeleteButton } from '@app/Services/DeleteButton';
import { Button } from '@patternfly/react-core';

const ResourcePools: React.ComponentType<any> = () => {
  const [resourcePoolsList, setResourcePools] = useState([] as any);
  const consoleURL = useSelector(selectConsoleURL);
  const columns = ["Name", "Min Available", "", "", ""];

  async function fetchResourcePools() {
    try {
      const rows = [];
      const resp = await getResourcePools();
      const resourcePools = resp.items;
      for (const resourcePool of resourcePools) {
        const name = <React.Fragment><a href={`${consoleURL}/k8s/ns/${resourcePool.metadata.namespace}/poolboy.gpte.redhat.com~v1~ResourcePool/${resourcePool.metadata.name}`} target="_blank">{resourcePool.metadata.name}</a></React.Fragment>;
        const minAvailable = resourcePool.spec.minAvailable;
        const scaleUpButton = <React.Fragment><Button style={{marginRight: -222}} variant="tertiary" onClick={() => { scaleUpPool(resourcePool) }}>+</Button></React.Fragment>;
        const scaleDownButton = <React.Fragment><Button style={{marginLeft: 0}} variant="tertiary" onClick={() => scaleDownPool(resourcePool)}>-</Button></React.Fragment>;
        const deleteButton = <React.Fragment><DeleteButton onClick={deleteAction}></DeleteButton></React.Fragment>;

        rows.push([name, minAvailable, scaleUpButton, scaleDownButton, deleteButton]);
      }
      setResourcePools(rows);
      return rows;
    } catch (err) {
      return err;
    }
  }

  async function scaleDownPool(resourcePool: { spec: { minAvailable: number; }; }) {
    if (resourcePool?.spec?.minAvailable > 0) {
      await scalePool(resourcePool, resourcePool?.spec?.minAvailable - 1);
    }
  }
  async function scaleUpPool(resourcePool: { spec: { minAvailable: number; }; }) {
    await scalePool(resourcePool, resourcePool?.spec?.minAvailable + 1);
  }

  useEffect(() => {
    fetchResourcePools();
  }, [scaleDownPool(resourcePoolsList), scaleUpPool(resourcePoolsList)]);

  function deleteAction(action: any) {
    console.log("hii form delete");
  }

  return (
    <div>
      <h1 style={{ fontSize: "2rem", textAlign: "center", padding: "10px" }}>ResourcePools</h1>
      {resourcePoolsList ?
        <TableList
          columns={columns}
          rows={resourcePoolsList}
        />
      : null}
    </div>
  );
}

export default ResourcePools;
