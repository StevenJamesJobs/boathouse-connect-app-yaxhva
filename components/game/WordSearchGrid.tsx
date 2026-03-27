/**
 * WordSearchGrid
 * Interactive letter grid with PanResponder drag-to-select mechanic.
 * Uses explicit row rendering (no flexWrap) for pixel-perfect layout.
 * Grid background shows through 1px gaps to create grid lines.
 */

import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Dimensions,
  GestureResponderEvent,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { GridCell, WordSearchPuzzle } from '@/types/game';
import { getSelectionCells, checkWordMatch } from '@/utils/game/wordSearchEngine';

interface WordSearchGridProps {
  puzzle: WordSearchPuzzle;
  selectedCells: GridCell[];
  foundWordIds: string[];
  onSelectionChange: (cells: GridCell[]) => void;
  onWordFound: (wordId: string) => void;
  disabled?: boolean;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = 16;
const GRID_BORDER = 1;
const CELL_GAP = 1; // 1px gap between cells — grid background shows through as grid lines

// Color palette for found word highlights (cycling)
const FOUND_COLORS = [
  '#10B981', '#6366F1', '#F59E0B', '#EC4899',
  '#8B5CF6', '#14B8A6', '#F97316', '#EF4444',
];

export default function WordSearchGrid({
  puzzle,
  selectedCells,
  foundWordIds,
  onSelectionChange,
  onWordFound,
  disabled = false,
}: WordSearchGridProps) {
  const colors = useThemeColors();
  const gridRef = useRef<View>(null);
  const gridOffsetRef = useRef({ x: 0, y: 0 });
  const isSelectingRef = useRef(false);

  // Calculate cell size: available content area inside grid border, minus gaps
  const availableWidth = SCREEN_WIDTH - GRID_PADDING * 2 - GRID_BORDER * 2;
  const cellSize = Math.floor((availableWidth - (puzzle.cols - 1) * CELL_GAP) / puzzle.cols);
  const stride = cellSize + CELL_GAP; // distance between cell origins
  const strideRef = useRef(stride);
  strideRef.current = stride;

  // Grid content dimensions (inside the border)
  const gridContentWidth = puzzle.cols * cellSize + (puzzle.cols - 1) * CELL_GAP;
  const gridContentHeight = puzzle.rows * cellSize + (puzzle.rows - 1) * CELL_GAP;

  // Map a touch point to a grid cell
  const getTouchedCell = useCallback(
    (pageX: number, pageY: number): GridCell | null => {
      const { x: offsetX, y: offsetY } = gridOffsetRef.current;
      // Subtract grid border to get position within content area
      const relX = pageX - offsetX - GRID_BORDER;
      const relY = pageY - offsetY - GRID_BORDER;
      const col = Math.floor(relX / strideRef.current);
      const row = Math.floor(relY / strideRef.current);
      if (row < 0 || row >= puzzle.rows || col < 0 || col >= puzzle.cols) return null;
      return { row, col };
    },
    [puzzle.rows, puzzle.cols]
  );

  const startCellRef = useRef<GridCell | null>(null);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,

    onPanResponderGrant: (e: GestureResponderEvent) => {
      if (disabled) return;
      // Measure grid position on first touch
      gridRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
        gridOffsetRef.current = { x: pageX, y: pageY };
      });
      const cell = getTouchedCell(e.nativeEvent.pageX, e.nativeEvent.pageY);
      if (cell) {
        startCellRef.current = cell;
        isSelectingRef.current = true;
        onSelectionChange([cell]);
      }
    },

    onPanResponderMove: (e: GestureResponderEvent) => {
      if (!isSelectingRef.current || !startCellRef.current) return;
      const current = getTouchedCell(e.nativeEvent.pageX, e.nativeEvent.pageY);
      if (!current) return;
      const cells = getSelectionCells(startCellRef.current, current);
      onSelectionChange(cells);
    },

    onPanResponderRelease: () => {
      if (!isSelectingRef.current) return;
      isSelectingRef.current = false;

      // Check for word match
      const matchedId = checkWordMatch(selectedCells, puzzle.words);
      if (matchedId) {
        onWordFound(matchedId);
      }

      // Clear selection
      onSelectionChange([]);
      startCellRef.current = null;
    },

    onPanResponderTerminate: () => {
      isSelectingRef.current = false;
      onSelectionChange([]);
      startCellRef.current = null;
    },
  });

  // Build a lookup for found cells → color index
  const foundCellMap = new Map<string, string>();
  puzzle.words.forEach((word, idx) => {
    if (foundWordIds.includes(word.id)) {
      const color = FOUND_COLORS[idx % FOUND_COLORS.length];
      word.cells.forEach((cell) => {
        foundCellMap.set(`${cell.row},${cell.col}`, color);
      });
    }
  });

  // Build a set for selected cells
  const selectedSet = new Set(selectedCells.map((c) => `${c.row},${c.col}`));

  const getCellStyle = (row: number, col: number) => {
    const key = `${row},${col}`;
    const foundColor = foundCellMap.get(key);
    const isSelected = selectedSet.has(key);

    if (foundColor) {
      return { backgroundColor: foundColor, opacity: 0.85 };
    }
    if (isSelected) {
      return { backgroundColor: colors.primary + 'AA' };
    }
    return { backgroundColor: colors.card };
  };

  const getCellTextStyle = (row: number, col: number) => {
    const key = `${row},${col}`;
    const foundColor = foundCellMap.get(key);
    const isSelected = selectedSet.has(key);
    if (foundColor || isSelected) {
      return { color: '#FFFFFF', fontWeight: '700' as const };
    }
    return { color: colors.text };
  };

  const fontSize = cellSize <= 20 ? 10 : cellSize <= 24 ? 11 : cellSize <= 28 ? 12 : 14;

  return (
    <View
      ref={gridRef}
      style={[
        styles.grid,
        {
          width: gridContentWidth,
          height: gridContentHeight,
          borderColor: colors.border,
          backgroundColor: colors.border + '44',
        },
      ]}
      {...panResponder.panHandlers}
    >
      {puzzle.grid.map((rowArr, rowIdx) => (
        <View
          key={rowIdx}
          style={[styles.gridRow, rowIdx > 0 && { marginTop: CELL_GAP }]}
        >
          {rowArr.map((letter, colIdx) => {
            const cellStyle = getCellStyle(rowIdx, colIdx);
            const textStyle = getCellTextStyle(rowIdx, colIdx);
            return (
              <View
                key={`${rowIdx}-${colIdx}`}
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize },
                  colIdx > 0 && { marginLeft: CELL_GAP },
                  cellStyle,
                ]}
              >
                <Text style={[styles.letter, { fontSize }, textStyle]}>
                  {letter}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    borderWidth: GRID_BORDER,
    borderRadius: 8,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0,
  },
});
