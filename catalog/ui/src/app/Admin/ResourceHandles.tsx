import React from "react";
import { useEffect, useState } from "react";
import { getResourceHandles } from '@app/api';
import { Link } from 'react-router-dom';
import { TableList } from '@app/components/TableList';
import { DeleteButton } from '@app/Services/DeleteButton';

const ResourceHandles: React.ComponentType<any> = () => {
    const [resourceHandlesList, setResourceHandles] = useState([] as any);

    const columns = ["Namespace", "Name", "ResourcePool", "ResourceClaim", ""];
    const rows = [];

    async function fetchResourceHandles() {
        try {
            const resp = await getResourceHandles();
            const resourceProviders = resp.items;
            for (const resourceProvider of resourceProviders) {
                const namespace = resourceProvider?.metadata?.namespace;
                const name = <React.Fragment><Link to={``}>{resourceProvider?.metadata?.name}</Link></React.Fragment>;
                const resourcePool = <React.Fragment><Link to={``}>{resourceProvider?.spec?.resourcePool?.name} </Link></React.Fragment> || "none";
                const resourceClaim = <React.Fragment><Link to={``}>{resourceProvider?.spec?.resourceClaim?.name}</Link></React.Fragment> || "none";
                const deleteButton = <React.Fragment><DeleteButton onClick={deleteAction}></DeleteButton></React.Fragment>;

                rows.push([namespace, name, resourcePool, resourceClaim, deleteButton]);
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
                    rows={resourceHandlesList} />
                : null}
        </div>
    );
}

export default ResourceHandles;
