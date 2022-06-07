import React from 'react';

import { Table, TableHeader, TableBody } from '@patternfly/react-table';

const SelectableTable: React.FC<{
  columns: any[];
  onSelectAll: any;
  rows: any[];
}> = ({ columns, onSelectAll, rows }) => {
  function onSelect(event, isSelected, rowId) {
    if (rowId === -1) {
      onSelectAll(isSelected);
    } else {
      const rowOnSelect = rows[rowId]?.onSelect;
      if (rowOnSelect) {
        rowOnSelect(isSelected);
      }
    }
  }

  return (
    <Table aria-label="Selectable Table" cells={columns} onSelect={onSelect} rows={rows} variant="compact">
      <TableHeader />
      <TableBody />
    </Table>
  );
};

export default SelectableTable;
