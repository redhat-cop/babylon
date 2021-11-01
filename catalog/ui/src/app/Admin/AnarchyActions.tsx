import React from "react";
import { useEffect, useState } from "react";
import { getAnarchyActions, deleteAnarchyAction } from '@app/api';
import { Link } from 'react-router-dom';

import { TableList } from '@app/components/TableList';
import { DeleteButton } from '@app/Services/DeleteButton';
const AnarchyActions: React.ComponentType<any> = () => {
    const [data, setData] = useState([] as any);
    let resp: any;
    async function fetchAnarchyActions() {
        try {
            const rows = [];
            resp = await getAnarchyActions();
            const items = resp.items;
            for (const item of items) {
                const namespace = <React.Fragment><Link to={``}>{item.metadata.namespace}</Link></React.Fragment>;
                const name = <React.Fragment><Link to={``}>{item.metadata.name}</Link></React.Fragment>
                const governor = <React.Fragment><Link to={``}>{item.metadata.labels['anarchy.gpte.redhat.com/governor']}</Link></React.Fragment>;
                const subject = <React.Fragment><Link to={``}>{item.metadata.labels['anarchy.gpte.redhat.com/subject']}</Link></React.Fragment>;
                const run = <React.Fragment><Link to={``}>{item.metadata.labels['anarchy.gpte.redhat.com/run']}</Link></React.Fragment>;
                const age = "";
                const deleteButton =
                    <React.Fragment><DeleteButton onClick={() => { deleteAction(item.metadata.name) }}></DeleteButton></React.Fragment>;
                rows.push([name, namespace, governor, subject, run, age, deleteButton]);
            }
            setData(rows);
        } catch (err) {
            return err;
        }
    }

    const columns = ["Name", "Namespace", "AnarchyGovernor", "AnarchySubject", "AnarchyRun", "Age", ""];

    useEffect(() => {
        fetchAnarchyActions()
    }, []);

    function deleteAction(action: String) {
        const DeleteConfirm = confirm(`Delete ${action} ?`);
        if (DeleteConfirm === true) {
            deleteAnarchyAction(action);
        }
    }

    return (
        <div>
            <div>
                <h1 style={{ fontSize: "2rem", textAlign: "center", padding: "10px" }}>AnarchyActions</h1>
                <TableList
                    columns={columns}
                    rows={data} />
            </div>
        </div>
    );
}

export default AnarchyActions;