import React, { useState } from 'react';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import { Pagination } from '@patternfly/react-core';

const SelectableTableWithPagination: React.FC<{
  columns: string[];
  onSelectAll: (checked: boolean) => void;
  rows: { selected: boolean; cells: React.ReactNode[]; onSelect: (checked: boolean) => void }[];
}> = ({ columns, onSelectAll, rows }) => {
  const defaultPerPage = 20;
  const [pageConfig, setPageConfig] = useState({
    perPage: defaultPerPage,
    page: 1,
    rows: { start: 0, end: defaultPerPage },
  });

  const onSelect = (_: React.FormEvent<HTMLInputElement>, isSelected: boolean, rowId: number) => {
    if (rowId === -1) {
      onSelectAll(isSelected);
    } else {
      const rowOnSelect = rows[rowId]?.onSelect;
      if (rowOnSelect) {
        rowOnSelect(isSelected);
      }
    }
  };

  const paginatedRows = rows.slice(pageConfig.rows.start, pageConfig.rows.end);

  // Calculate if all visible rows are selected for the header checkbox
  const allVisibleRowsSelected = paginatedRows.length > 0 && paginatedRows.every((row) => row.selected);

  return (
    <>
      <Pagination
        itemCount={rows.length}
        page={pageConfig.page}
        perPage={pageConfig.perPage}
        onSetPage={(_evt, newPage, perPage, startIdx, endIdx) =>
          setPageConfig({ page: newPage, perPage: pageConfig.perPage, rows: { start: startIdx, end: endIdx } })
        }
        onPerPageSelect={(_evt, newPerPage, newPage, startIdx, endIdx) =>
          setPageConfig({
            perPage: newPerPage,
            page: newPage,
            rows: { start: startIdx, end: endIdx },
          })
        }
        perPageOptions={[
          { title: '20', value: 20 },
          { title: '50', value: 50 },
          { title: '100', value: 100 },
        ]}
      />
      <Table aria-label="Selectable Table" variant="compact">
        <Thead>
          <Tr>
            <Th
              select={{
                onSelect: (_event, isSelected) => onSelect(null, isSelected, -1),
                isSelected: allVisibleRowsSelected,
              }}
            />
            {columns.map((column, index) => (
              <Th key={index}>{column}</Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {paginatedRows.map((row, rowIndex) => {
            const actualRowIndex = pageConfig.rows.start + rowIndex;
            return (
              <Tr key={actualRowIndex}>
                <Td
                  select={{
                    onSelect: (_event, isSelected) => onSelect(null, isSelected, actualRowIndex),
                    isSelected: row.selected || false,
                    rowIndex: actualRowIndex,
                  }}
                />
                {row.cells.map((cell: React.ReactNode, cellIndex: number) => (
                  <Td key={cellIndex} dataLabel={columns[cellIndex]}>
                    {cell}
                  </Td>
                ))}
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </>
  );
};

export default SelectableTableWithPagination;
