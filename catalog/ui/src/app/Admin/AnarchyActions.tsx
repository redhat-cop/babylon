import React from "react";
import { useEffect, useState } from "react";
import { getAnarchyActions, deleteAnarchyAction } from '@app/api';
import { Link } from 'react-router-dom';

import { DeleteButton } from '@app/Services/DeleteButton';
import { TableComposable, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import { TableList } from '@app/components/TableList';
import { DatabaseIcon } from "@patternfly/react-icons";


const AnarchyActions: React.ComponentType<any> = () => {
    const [data, setData] = useState([] as any);
    let nameSpaceData = [];
    let resp;
    async function fetchAnarchyActions() {
        try {
            const rows = [];
            resp = await getAnarchyActions();
            const items = resp.items;
            console.log("items", items);
            for (const item of items) {
                const namespace = item.metadata.namespace;
                const name = item.metadata.name;
                const governor = item.metadata.labels['anarchy.gpte.redhat.com/governor'];
                const subject = item.metadata.labels['anarchy.gpte.redhat.com/subject'];
                const run = item.metadata.labels['anarchy.gpte.redhat.com/run'];
                const age = item?.age;
                rows.push([name, namespace, governor, subject, run]);
            }
            setData(rows);
            console.log("data", data);

            return rows;
        } catch (err) {
            return err;
        }
    }

    const columns = ["Name", "Namespace", "AnarchyGovernor", "AnarchySubject", "AnarchyRun", "Age"];

    useEffect(() => {
        fetchAnarchyActions()
    }, []);

    function deleteAction(action: any) {
        deleteAnarchyAction(action);
    }


    return (
        <div>
            <h1 style={{ fontSize: "2rem", textAlign: "center", padding: "10px" }}>AnarchyActions</h1>
            <TableList
                columns={columns}
                rows={data} />
        </div>
    );
}

export default AnarchyActions;