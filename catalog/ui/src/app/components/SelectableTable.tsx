import React from 'react';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';

const SelectableTable: React.FC<{
  columns: any[];
  onSelectAll: any;
  rows: any[];
}> = ({ columns, onSelectAll, rows }) => {
  function onSelect(_: any, isSelected: boolean, rowId: string | number) {
    if (rowId === -1) {
      onSelectAll(isSelected);
    } else {
      const row = rows[rowId];
      if (row?.disableSelection) {
        return; // Don't allow selection for disabled rows
      }
      const rowOnSelect = row?.onSelect;
      if (rowOnSelect) {
        rowOnSelect(isSelected);
      }
    }
  }

  // Calculate if all selectable rows are selected for the header checkbox
  const selectableRows = rows.filter((row) => !row.disableSelection);
  const allRowsSelected = selectableRows.length > 0 && selectableRows.every((row) => row.selected);

  return (
    <Table aria-label="Selectable Table" variant="compact">
      <Thead>
        <Tr>
          <Th
            select={{
              onSelect: (_event, isSelected) => onSelect(null, isSelected, -1),
              isSelected: allRowsSelected,
            }}
          />
          {columns.map((column, index) => (
            <Th key={index}>{column}</Th>
          ))}
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row, rowIndex) => (
          <Tr key={rowIndex}>
            <Td
              select={{
                onSelect: (_event, isSelected) => onSelect(null, isSelected, rowIndex),
                isSelected: row.selected || false,
                isDisabled: row.disableSelection || false,
                rowIndex,
              }}
            />
            {row.cells.map((cell: any, cellIndex: number) => (
              <Td key={cellIndex} dataLabel={columns[cellIndex]}>
                {cell}
              </Td>
            ))}
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

export default SelectableTable;
