import React from 'react';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';

export interface SelectableTableRow {
  // Callers build cells as unknown[]; each cell is rendered as a ReactNode.
  cells: unknown[];
  disableSelection?: boolean;
  onSelect?: (isSelected: boolean) => void;
  selected?: boolean;
}

const SelectableTable: React.FC<{
  columns: string[];
  onSelectAll: (isSelected: boolean) => void;
  rows: SelectableTableRow[];
}> = ({ columns, onSelectAll, rows }) => {
  function onSelect(_: unknown, isSelected: boolean, rowId: string | number) {
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
            // eslint-disable-next-line @eslint-react/no-array-index-key -- column headers are plain strings that may repeat (e.g. empty) and are positional
            <Th key={index}>{column}</Th>
          ))}
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row, rowIndex) => (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- SelectableTableRow has no identity field and rowIndex is the selection id passed to onSelect
          <Tr key={rowIndex}>
            <Td
              select={{
                onSelect: (_event, isSelected) => onSelect(null, isSelected, rowIndex),
                isSelected: row.selected || false,
                isDisabled: row.disableSelection || false,
                rowIndex,
              }}
            />
            {row.cells.map((cell, cellIndex: number) => (
              // eslint-disable-next-line @eslint-react/no-array-index-key -- cells are positional within a row
              <Td key={cellIndex} dataLabel={columns[cellIndex]}>
                {cell as React.ReactNode}
              </Td>
            ))}
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

export default SelectableTable;
