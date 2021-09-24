import * as React from 'react';

import {
  headerCol,
  Table,
  TableHeader,
  TableBody,
} from '@patternfly/react-table';

export interface SelectableTableProps {
  columns: Array<any>;
  onSelectAll: any;
  rows: Array<any>;
}

const SelectableTable: React.FunctionComponent<SelectableTableProps> = ({
  columns,
  onSelectAll,
  rows,
}) => {
  function onSelect(event, isSelected, rowId) {
    if(rowId === -1) {
      onSelectAll(isSelected);
    } else {
      const rowOnSelect = rows[rowId]?.onSelect;
      if (rowOnSelect) {
        rowOnSelect(isSelected);
      }
    }
  }

  return (
    <Table
      aria-label="Selectable Table"
      cells={columns}
      onSelect={onSelect}
      rows={rows}
    >
      <TableHeader />
      <TableBody />
    </Table>
  );
}

export { SelectableTable };
