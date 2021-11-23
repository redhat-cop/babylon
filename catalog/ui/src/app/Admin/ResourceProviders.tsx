import React from "react";
import { useEffect, useState } from "react";
import { getResourceProviders } from '@app/api';
import { Link } from 'react-router-dom';
import { TableList } from '@app/components/TableList';

const ResourceProviders: React.ComponentType<any> = () => {
    const [resourceProvidersList, setResourceProviders] = useState([] as any);

    const columns = ["Namespace", "Name"];
    const rows = [];

    async function fetchResourceProviders() {
        try {
            const resp = await getResourceProviders();
            const resourceProviders = resp.items;
            for (const resourceProvider of resourceProviders) {
                const namespace = resourceProvider.metadata.namespace;
                const name = <React.Fragment><Link to={``}>{resourceProvider.metadata.name}</Link></React.Fragment>;

                rows.push([namespace, name]);
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
                    rows={resourceProvidersList} />
                : null}

        </div>
    );
}
export default ResourceProviders;
