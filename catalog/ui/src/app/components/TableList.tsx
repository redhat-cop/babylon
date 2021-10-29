import * as React from 'react';

import {
  Table,
  TableHeader,
  TableBody,
} from '@patternfly/react-table';

import { DeleteButton } from '@app/Services/DeleteButton';

export interface SelectableTableProps {
  columns: Array<any>;
  rows: Array<any>;
}

const TableList: React.FunctionComponent<SelectableTableProps> = ({
  columns,
  rows,
}) =>{

  return (
    <Table
      aria-label="Table"
      cells={columns}
      rows={rows}
    >
      <TableHeader />
      <TableBody />
    </Table>
  );
}

export { TableList };
