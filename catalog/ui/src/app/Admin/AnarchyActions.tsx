import React from "react";
import { useEffect, useState } from "react";
import { getAnarchyActionsTables, deleteAnarchyAction } from '@app/api';
import { Link } from 'react-router-dom';

import { TableList } from '@app/components/TableList';
import { DeleteButton } from '@app/Services/DeleteButton';

const getRowItems = (rowIndexes, rows) => {
   const rowItems = rows.map((row) => ({
        namespace: row.object.metadata.namespace,
        name: row.cells[rowIndexes['Name']],
        governor: row.cells[rowIndexes['Governor']],
        subject: row.cells[rowIndexes['Subject']],
        run: row.cells[rowIndexes['Run']],
        age: row.cells[rowIndexes['Age']],
    }));
    return rowItems;
}

const AnarchyActions: React.ComponentType<any> = () => {
    const [data, setData] = useState([] as any);
    const rows = [];
    let resp: any;
    async function fetchAnarchyActions() {
        try {
            resp = await getAnarchyActionsTables();
            const { columnDefinitions, rows: rowResp } = resp;
            const rowIndexes = {};
            columnDefinitions.forEach((columnDefination, index) => {
                rowIndexes[columnDefination.name] = index;
            });
            const rowItems = getRowItems(rowIndexes, rowResp);
            for (const item of rowItems) {
                const namespace = <><Link to={``}>{item.namespace}</Link></>;
                const name = <><Link to={``}>{item.name}</Link></>
                const governor = <><Link to={``}>{item.governor}</Link></>;
                const subject = <><Link to={``}>{item.subject}</Link></>;
                const run = <><Link to={``}>{item.run}</Link></>;
                const age = item.age;
                const deleteButton =
                    <React.Fragment><DeleteButton onClick={() => { deleteAction(item.name) }}></DeleteButton></React.Fragment>;
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