/**
 * WordSearchGrid — the s76 lockdown board.
 * Floating letters (no cell boxes or dividers) over the theme-aware
 * word-search gradient; found words are soft highlighter CAPSULES drawn
 * behind the letters (dark: airy pastel + glow · light: deeper hue + soft
 * glow, no ring — the WS·B call), and the in-progress drag is an OUTLINED
 * capsule. PanResponder drag-to-select is unchanged from s6x.
 *
 * The gradient board surface itself is rendered by the play screen (it owns
 * padding/radius); this component draws letters + capsules and stays
 * transparent. All colors come from gameVisuals (the only game-color source).
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
import { useAppTheme } from '@/contexts/ThemeContext';
import { GridCell, WordSearchPuzzle } from '@/types/game';
import { getSelectionCells, checkWordMatch } from '@/utils/game/wordSearchEngine';
import {
  PLAY_VISUALS,
  WS_CAPSULE_COLORS,
  WS_DRAG_OUTLINE,
} from '@/components/game/gameVisuals';

interface WordSearchGridProps {
  puzzle: WordSearchPuzzle;
  selectedCells: GridCell[];
  foundWordIds: string[];
  onSelectionChange: (cells: GridCell[]) => void;
  onWordFound: (wordId: string) => void;
  disabled?: boolean;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_PAD = 16; // play screen horizontal padding
const BOARD_PAD = 10; // the gradient board's inner padding (screen-side constant too)
const CELL_GAP = 2;

/** One straight run of cells → center point, length and angle for a capsule. */
function capsuleGeometry(cells: GridCell[], cellSize: number, stride: number) {
  const first = cells[0];
  const last = cells[cells.length - 1];
  const x0 = first.col * stride + cellSize / 2;
  const y0 = first.row * stride + cellSize / 2;
  const x1 = last.col * stride + cellSize / 2;
  const y1 = last.row * stride + cellSize / 2;
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  const length = Math.hypot(x1 - x0, y1 - y0) + cellSize;
  const angle = Math.atan2(y1 - y0, x1 - x0) * (180 / Math.PI);
  return {
    left: midX - length / 2,
    top: midY - cellSize / 2,
    width: length,
    height: cellSize,
    transform: [{ rotate: `${angle}deg` }],
  };
}

export default function WordSearchGrid({
  puzzle,
  selectedCells,
  foundWordIds,
  onSelectionChange,
  onWordFound,
  disabled = false,
}: WordSearchGridProps) {
  const { resolvedMode } = useAppTheme();
  const scheme = resolvedMode === 'dark' ? 'dark' : 'light';
  const ink = PLAY_VISUALS.word_search.boardInk[scheme];
  const capsuleColors = WS_CAPSULE_COLORS[scheme];

  const gridRef = useRef<View>(null);
  const gridOffsetRef = useRef({ x: 0, y: 0 });
  const isSelectingRef = useRef(false);

  const availableWidth = SCREEN_WIDTH - SCREEN_PAD * 2 - BOARD_PAD * 2;
  const cellSize = Math.floor((availableWidth - (puzzle.cols - 1) * CELL_GAP) / puzzle.cols);
  const stride = cellSize + CELL_GAP;
  const strideRef = useRef(stride);
  strideRef.current = stride;

  const gridWidth = puzzle.cols * cellSize + (puzzle.cols - 1) * CELL_GAP;
  const gridHeight = puzzle.rows * cellSize + (puzzle.rows - 1) * CELL_GAP;

  const getTouchedCell = useCallback(
    (pageX: number, pageY: number): GridCell | null => {
      const { x: offsetX, y: offsetY } = gridOffsetRef.current;
      const relX = pageX - offsetX;
      const relY = pageY - offsetY;
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
      onSelectionChange(getSelectionCells(startCellRef.current, current));
    },

    onPanResponderRelease: () => {
      if (!isSelectingRef.current) return;
      isSelectingRef.current = false;
      const matchedId = checkWordMatch(selectedCells, puzzle.words);
      if (matchedId) onWordFound(matchedId);
      onSelectionChange([]);
      startCellRef.current = null;
    },

    onPanResponderTerminate: () => {
      isSelectingRef.current = false;
      onSelectionChange([]);
      startCellRef.current = null;
    },
  });

  // Found-word capsules — color cycles per word's index in the puzzle so a
  // word keeps its color for the whole game.
  const capsules = puzzle.words
    .map((word, idx) => ({ word, color: capsuleColors[idx % capsuleColors.length] }))
    .filter(({ word }) => foundWordIds.includes(word.id));

  // Alpha baked into the fill so the glow shadow keeps full hue strength.
  const fillAlpha = scheme === 'dark' ? '57' : '5C'; // ≈34% / ≈36%
  const dragOutline = WS_DRAG_OUTLINE[scheme];

  const fontSize = cellSize <= 20 ? 11 : cellSize <= 24 ? 12 : cellSize <= 28 ? 13 : 15;

  return (
    <View
      ref={gridRef}
      style={{ width: gridWidth, height: gridHeight, alignSelf: 'center' }}
      {...panResponder.panHandlers}
    >
      {/* Capsules under the letters */}
      {capsules.map(({ word, color }) => (
        <View
          key={word.id}
          pointerEvents="none"
          style={[
            styles.capsule,
            capsuleGeometry(word.cells, cellSize, stride),
            {
              backgroundColor: color + fillAlpha,
              boxShadow: `0 0 ${Math.round(cellSize * 0.45)}px 1px ${color}66`,
            },
          ]}
        />
      ))}

      {/* In-progress drag — outlined capsule, no fill */}
      {selectedCells.length > 0 && (
        <View
          pointerEvents="none"
          style={[
            styles.capsule,
            capsuleGeometry(selectedCells, cellSize, stride),
            { borderWidth: 2, borderColor: dragOutline },
          ]}
        />
      )}

      {/* Floating letters */}
      {puzzle.grid.map((rowArr, rowIdx) => (
        <View key={rowIdx} style={[styles.row, { top: rowIdx * stride, height: cellSize }]}>
          {rowArr.map((letter, colIdx) => (
            <View
              key={`${rowIdx}-${colIdx}`}
              style={[styles.cell, { width: cellSize, height: cellSize, left: colIdx * stride }]}
            >
              <Text style={[styles.letter, { fontSize, color: ink }]}>{letter}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    position: 'absolute',
    borderRadius: 999,
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  cell: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
