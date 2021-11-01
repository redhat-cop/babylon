import React from "react";
import { useEffect, useState } from "react";
import { getResourcepools, scalePool } from '@app/api';
import { TableList } from '@app/components/TableList';
import { DeleteButton } from '@app/Services/DeleteButton';
import { Button } from '@patternfly/react-core';

const ResourcePools: React.ComponentType<any> = () => {
    const [resourcePoolsList, setResourcePools] = useState([] as any);
    const columns = ["Namespace", "Name", "Min Available", "", "", ""];

    async function fetchResourcePools() {
        try {
            const rows = [];
            const resp = await getResourcepools();
            const resourcepools = resp.items;
            for (const resourcepool of resourcepools) {
                const namespace = resourcepool.metadata.namespace;
                const name = resourcepool.metadata.name;
                const minAvailable = resourcepool.spec.minAvailable;
                const scaleUpButton = <React.Fragment><Button variant="tertiary" onClick={() => { scaleUpPool(resourcepool) }}>+</Button></React.Fragment>;
                const scaleDownButton = <React.Fragment><Button variant="tertiary" onClick={() => scaleDownPool(resourcepool)}>-</Button></React.Fragment>;
                const deleteButton = <React.Fragment><DeleteButton onClick={deleteAction}></DeleteButton></React.Fragment>;

                rows.push([namespace, name, minAvailable, scaleUpButton, scaleDownButton, deleteButton]);
            }
            setResourcePools(rows);
            return rows;
        } catch (err) {
            return err;
        }
    }
    async function scaleDownPool(resourcepool: { spec: { minAvailable: number; }; }) {
        if (resourcepool.spec.minAvailable > 0) {
            await scalePool(resourcepool, resourcepool.spec.minAvailable - 1);
        }
    }
    async function scaleUpPool(resourcepool: { spec: { minAvailable: number; }; }) {
        await scalePool(resourcepool, resourcepool.spec.minAvailable + 1);
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
                    rows={resourcePoolsList} />
                : null}
        </div>
    );
}

export default ResourcePools;
