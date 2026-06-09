import React, { useMemo } from 'react';
import { Grid, List, CellComponentProps, RowComponentProps } from 'react-window';
import { CatalogItem } from '@app/types';
import CatalogItemCard from './CatalogItemCard';
import CatalogItemListItem from './CatalogItemListItem';

const GUTTER_SIZE = 16;
const GRID_COLUMN_WIDTH = 280;
const GRID_ROW_HEIGHT = 260;
const LIST_ROW_HEIGHT = 150;

type GridCellProps = {
  catalogItemsResultAsGrid: CatalogItem[][];
};

const Cell = ({ columnIndex, rowIndex, style, catalogItemsResultAsGrid }: CellComponentProps<GridCellProps>) => (
  <div
    style={{
      ...style,
      left: Number(style.left) + GUTTER_SIZE,
      top: Number(style.top) + GUTTER_SIZE,
      width: Number(style.width) - GUTTER_SIZE,
      height: Number(style.height) - GUTTER_SIZE,
    }}
  >
    {catalogItemsResultAsGrid[rowIndex][columnIndex] ? (
      <CatalogItemCard catalogItem={catalogItemsResultAsGrid[rowIndex][columnIndex]} />
    ) : null}
  </div>
);

type ListRowProps = {
  catalogItems: CatalogItem[];
};

const Row = ({ index, style, catalogItems }: RowComponentProps<ListRowProps>) => (
  <div
    style={{
      ...style,
      top: Number(style.top) + GUTTER_SIZE,
    }}
  >
    {catalogItems[index] ? <CatalogItemListItem catalogItem={catalogItems[index]} /> : null}
  </div>
);

const CatalogGridList: React.FC<{ catalogItems: CatalogItem[]; wrapperRect: DOMRect; view: 'gallery' | 'list' }> = ({
  catalogItems,
  wrapperRect,
  view,
}) => {
  const gridWidth = wrapperRect?.width || 1000;
  const gridHeight = window.innerHeight - (wrapperRect?.top || 0) || 1000;
  const catalogItemsColumnsSize = Math.floor(gridWidth / (GRID_COLUMN_WIDTH + GUTTER_SIZE));
  const catalogItemsResultAsGrid = useMemo(
    () =>
      catalogItems.reduce((grid, item, index) => {
        if (index % catalogItemsColumnsSize === 0) {
          grid.push([]);
        }
        if (grid[grid.length - 1]) grid[grid.length - 1].push(item);
        return grid;
      }, []),
    [catalogItems, catalogItemsColumnsSize],
  );

  return view === 'gallery' ? (
    <div style={{ width: gridWidth, height: gridHeight }}>
      <Grid<GridCellProps>
        cellComponent={Cell}
        cellProps={{ catalogItemsResultAsGrid }}
        columnCount={catalogItemsColumnsSize}
        columnWidth={GRID_COLUMN_WIDTH + GUTTER_SIZE}
        rowCount={catalogItemsResultAsGrid.length}
        rowHeight={GRID_ROW_HEIGHT + GUTTER_SIZE}
      />
    </div>
  ) : (
    <div style={{ width: gridWidth, height: gridHeight }}>
      <List<ListRowProps>
        rowComponent={Row}
        rowProps={{ catalogItems }}
        rowCount={catalogItems.length}
        rowHeight={LIST_ROW_HEIGHT + GUTTER_SIZE}
      />
    </div>
  );
};

export default CatalogGridList;
