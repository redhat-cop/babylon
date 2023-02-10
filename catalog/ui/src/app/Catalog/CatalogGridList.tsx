import React, { useCallback, useMemo } from 'react';
import { FixedSizeGrid as Grid, FixedSizeList as List } from 'react-window';
import { CatalogItem } from '@app/types';
import { ReactWindowScroller } from '@app/utils/react-window-scroller';
import CatalogItemCard from './CatalogItemCard';
import CatalogItemListItem from './CatalogItemListItem';

const GUTTER_SIZE = 16;
const GRID_COLUMN_WIDTH = 280;
const GRID_ROW_HEIGHT = 260;
const LIST_ROW_HEIGHT = 150;
const SAFE_MARGIN = 2000;

const CatalogGridList: React.FC<{ catalogItems: CatalogItem[]; wrapperRect: DOMRect; view: 'gallery' | 'list' }> = ({
  catalogItems,
  wrapperRect,
  view,
}) => {
  const gridWidth = wrapperRect?.width || 1000;
  const gridHeight = window.innerHeight - wrapperRect?.top + SAFE_MARGIN || 1000;
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
    [catalogItems, catalogItemsColumnsSize]
  );

  const Cell = useCallback(
    ({ columnIndex, rowIndex, style }) => (
      <div
        style={{
          ...style,
          left: style.left + GUTTER_SIZE,
          top: style.top + GUTTER_SIZE,
          width: style.width - GUTTER_SIZE,
          height: style.height - GUTTER_SIZE,
        }}
      >
        {catalogItemsResultAsGrid[rowIndex][columnIndex] ? (
          <CatalogItemCard catalogItem={catalogItemsResultAsGrid[rowIndex][columnIndex]} />
        ) : null}
      </div>
    ),
    [catalogItemsResultAsGrid]
  );

  const Row = useCallback(
    ({ index, style }) => (
      <div
        style={{
          ...style,
          top: style.top + GUTTER_SIZE,
        }}
      >
        {catalogItems[index] ? <CatalogItemListItem catalogItem={catalogItems[index]} /> : null}
      </div>
    ),
    [catalogItems]
  );

  return (
    <ReactWindowScroller isGrid={view === 'gallery'}>
      {({ ref, outerRef, style, onScroll }) =>
        view === 'gallery' ? (
          <Grid
            ref={ref}
            outerRef={outerRef}
            style={style}
            columnCount={catalogItemsColumnsSize}
            columnWidth={GRID_COLUMN_WIDTH + GUTTER_SIZE}
            rowCount={catalogItemsResultAsGrid.length}
            rowHeight={GRID_ROW_HEIGHT + GUTTER_SIZE}
            width={gridWidth}
            height={gridHeight}
            onScroll={onScroll}
          >
            {Cell}
          </Grid>
        ) : (
          <List
            ref={ref}
            outerRef={outerRef}
            style={style}
            width={gridWidth}
            height={gridHeight}
            onScroll={onScroll}
            itemCount={catalogItems.length}
            itemSize={LIST_ROW_HEIGHT + GUTTER_SIZE}
          >
            {Row}
          </List>
        )
      }
    </ReactWindowScroller>
  );
};

export default CatalogGridList;
