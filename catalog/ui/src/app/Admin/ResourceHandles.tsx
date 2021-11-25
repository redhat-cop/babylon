import React from "react";
import { useEffect, useState } from "react";
import { useSelector } from 'react-redux';
import { getResourceHandles } from '@app/api';
import { selectConsoleURL } from '@app/store';
import { TableList } from '@app/components/TableList';
import { DeleteButton } from '@app/Services/DeleteButton';

const ResourceHandles: React.ComponentType<any> = () => {
  const [resourceHandlesList, setResourceHandles] = useState([] as any);
  const consoleURL = useSelector(selectConsoleURL);

  const columns = ["Name", "ResourcePool", "ResourceClaim", ""];
  const rows = [];

  async function fetchResourceHandles() {
    try {
      const resp = await getResourceHandles();
      const resourceHandles = resp.items;
      for (const resourceHandle of resourceHandles) {
        const name = <React.Fragment><a href={`${consoleURL}/k8s/ns/${resourceHandle?.metadata?.namespace}/poolboy.gpte.redhat.com~v1~ResourceHandle/${resourceHandle?.metadata?.name}`} target="_blank">{resourceHandle?.metadata?.name}</a></React.Fragment>;
        const resourcePool = (resourceHandle?.spec?.resourcePool ?
          <React.Fragment><a href={`${consoleURL}/k8s/ns/${resourceHandle?.spec?.resourcePool?.namespace}/poolboy.gpte.redhat.com~v1~ResourcePool/${resourceHandle?.spec?.resourcePool?.name}`} target="_blank">{resourceHandle?.spec?.resourcePool?.name}</a></React.Fragment>
        : "-")
        const resourceClaim = (resourceHandle?.spec?.resourceClaim ?
          <React.Fragment><a href={`${consoleURL}/k8s/ns/${resourceHandle.spec.resourceClaim.namespace}/poolboy.gpte.redhat.com~v1~ResourceClaim/${resourceHandle.spec.resourceClaim.name}`} target="_blank">{resourceHandle?.spec?.resourceClaim?.name}</a></React.Fragment>
        : "-")
        const deleteButton = <React.Fragment><DeleteButton onClick={deleteAction}></DeleteButton></React.Fragment>;

        rows.push([name, resourcePool, resourceClaim, deleteButton]);
      }
      setResourceHandles(rows);
      return rows;
    } catch (err) {
      return err;
    }
  }

  useEffect(() => {
    fetchResourceHandles()
  }, []);

  function deleteAction(action: any) {
    console.log("hii from delete");
  }

  return (
    <div>
      <h1 style={{ fontSize: "2rem", textAlign: "center", padding: "10px" }}>ResourceHandles</h1>
      {resourceHandlesList ?
        <TableList
          columns={columns}
          rows={resourceHandlesList}
        />
      : null}
    </div>
  );
}

export default ResourceHandles;
