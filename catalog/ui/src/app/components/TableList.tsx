import * as React from 'react';

import {
  headerCol,
  Table,
  TableHeader,
  TableBody,
} from '@patternfly/react-table';

export interface TableListProps {
  columns: Array<any>;
  rows: Array<any>;
}

const TableList: React.FunctionComponent<TableListProps> = ({
  columns,
  rows,
}) => {
  
  return (
    <Table
      aria-label="Selectable Table"
      cells={columns}
      rows={rows}
    >
      <TableHeader />
      <TableBody />
    </Table>
  );
}

export { TableList };
