import React from "react";
import { useEffect, useState } from "react";
import { getResourcepools } from '@app/api';
import { Link } from 'react-router-dom';

import { DeleteButton } from '@app/Services/DeleteButton';
import { TableList } from '@app/components/TableList';

const ResourcePools: React.ComponentType<any> = () => {
    const [data, setResourcePools] = useState([] as any);
    const columns = ["Name", "Namespace", "Min Available"];

    async function fetchResourcePools() {
        try {
            const rows = [];
            const resp = await getResourcepools();
            const items = resp.items;
            for (const item of items) {
                const namespace = item.metadata.namespace;
                const name = item.metadata.name;
                const minAvailable = item.spec.minAvailable;
                rows.push([name, namespace, minAvailable]);
            }
            setResourcePools(rows);
            return rows;
        } catch (err) {
            setResourcePools({ err: err });
        }
    }
    useEffect(() => {
        fetchResourcePools()
    }, []);

    return (
        <div>
            <h1 style={{ fontSize: "2rem", textAlign: "center", padding: "10px" }}>ResourcePools</h1>

            <TableList
                columns={columns}
                rows={data}
            />

        </div>
    );
}

export default ResourcePools;
