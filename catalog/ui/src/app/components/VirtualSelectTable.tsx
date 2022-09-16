import React, { useEffect, useRef, useState } from 'react';
import { Table, TableHeader, Td, Tr } from '@patternfly/react-table';
import { AutoSizer, VirtualTableBody, WindowScroller } from '@patternfly/react-virtualized-extension';
import { debounce } from '@patternfly/react-core';

import './virtual-select-table.css';

const VirtualSelectableTable: React.FC<{
  columns: string[];
  onSelectAll: (checked: boolean) => void;
  rows: { selected: boolean; cells: React.ReactNode[]; onSelect: (checked: boolean) => void }[];
}> = ({ columns, onSelectAll, rows }) => {
  const ref = useRef(null);
  const [height, setHeight] = useState('0px');
  const [selected, setSelected] = React.useState(rows.map(() => false));

  const handleResize = debounce(function () {
    if (ref.current) {
      setHeight(`${window.innerHeight - ref.current.offsetTop}px`);
    }
  }, 100);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  const onSelect = (_: React.FormEvent<HTMLInputElement>, isSelected: boolean, rowId: number) => {
    setSelected(selected.map((sel, index) => (rowId === -1 || index === rowId ? isSelected : sel)));
    if (rowId === -1) {
      onSelectAll(isSelected);
    } else {
      const rowOnSelect = rows[rowId]?.onSelect;
      if (rowOnSelect) {
        rowOnSelect(isSelected);
      }
    }
  };

  const rowRenderer = ({ index, key, style }) => (
    <Tr data-id={index} key={key} style={style}>
      <Td
        key={`${index}-0`}
        select={{
          rowIndex: index,
          onSelect: onSelect,
          isSelected: selected[index],
        }}
      />

      {rows[index].cells.map((row, i: number) => (
        <Td key={`${index}-${i + 1}`} dataLabel={columns[i]}>
          {row}
        </Td>
      ))}
    </Tr>
  );

  const scrollableContainerStyle: React.CSSProperties = {
    height,
    overflowX: 'auto',
    overflowY: 'scroll',
    scrollBehavior: 'smooth',
    WebkitOverflowScrolling: 'touch',
    position: 'relative',
  };

  return (
    <div className="pf-c-scrollablegrid" ref={ref} style={scrollableContainerStyle}>
      <Table aria-label="Selectable Table" cells={columns} onSelect={onSelect} rows={rows} variant="compact">
        <TableHeader />
      </Table>
      {ref.current ? (
        <WindowScroller scrollElement={ref.current}>
          {({ height, isScrolling, registerChild, onChildScroll, scrollTop }) => (
            <AutoSizer disableHeight>
              {({ width }) => (
                <div ref={registerChild}>
                  <VirtualTableBody
                    className="pf-c-table pf-m-grid-md pf-m-compact pf-c-virtualized pf-c-window-scroller"
                    rowHeight={41}
                    autoHeight={true}
                    height={height || 0}
                    overscanRowCount={1}
                    columnCount={(rows[0]?.cells.length || 0) + 1}
                    rows={rows}
                    rowCount={rows.length}
                    rowRenderer={rowRenderer}
                    isScrolling={isScrolling}
                    isScrollingOptOut={true}
                    onScroll={onChildScroll}
                    scrollTop={scrollTop}
                    width={width}
                  />
                </div>
              )}
            </AutoSizer>
          )}
        </WindowScroller>
      ) : null}
    </div>
  );
};

export default VirtualSelectableTable;
