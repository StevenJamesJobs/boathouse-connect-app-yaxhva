/**
 * joltStore — the tiny shared state behind the Jolt relay (s87).
 *
 * ONE bolt lives at the app root (JoltRoot). Search bars that can hold it mount a
 * JoltDockSlot; the FOCUSED slot publishes its window-space center here and the
 * root flies the bolt in. While the bolt rests in a slot, the slot draws it (the
 * "mini" bolt) and the root's flyer is hidden — so a docked bolt scrolls, collapses
 * and fades with its bar for free, and a failed measurement leaves a normal bar.
 *
 * No React in here: a plain external store read through useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';

export type JoltSlotKind = 'field' | 'bar';

export interface JoltSlot {
  /** Stable id shared by bars that sit in the SAME spot (guides + editor = 'guides'). */
  id: string;
  /** 'field' = a local search field whose mini bolt opens the palette; 'bar' = the whole bar opens it. */
  kind: JoltSlotKind;
  /** Window-space center of the slot. */
  x: number;
  y: number;
  /** The host's chrome is collapsed/faded — the bolt keeps its dock but nothing should fly from here. */
  hidden: boolean;
}

export interface JoltDockEvent {
  id: string;
  /** true = the bolt flew in (play the landing pulse); false = a quiet swap / fade. */
  animate: boolean;
  n: number;
}

interface JoltState {
  /** The focused, measured slot (or none). */
  slot: JoltSlot | null;
  /** Slot id the bolt currently rests in (the slot draws the mini bolt); null = home / flying / hidden. */
  docked: string | null;
  /** Last dock, for the slot's landing pulse. */
  dockEvent: JoltDockEvent | null;
  paletteOpen: boolean;
}

let state: JoltState = { slot: null, docked: null, dockEvent: null, paletteOpen: false };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getJoltState(): JoltState {
  return state;
}

export function subscribeJolt(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Read a slice of the store; re-renders only when the selected value changes. */
export function useJoltStore<T>(selector: (s: JoltState) => T): T {
  return useSyncExternalStore(subscribeJolt, () => selector(state), () => selector(state));
}

// Ownership token so a blurred slot's late measurement can never clobber the
// slot that has since taken focus (the old module-wide dock target's failure mode).
let slotOwner: object | null = null;

/** Called by the FOCUSED JoltDockSlot with its measured center; `null` withdraws (blur/unmount). */
export function setJoltSlot(owner: object, slot: JoltSlot | null) {
  if (slot) {
    slotOwner = owner;
    state = { ...state, slot };
    emit();
    return;
  }
  if (slotOwner !== owner) return; // someone else owns the slot now — ignore the stale withdraw
  slotOwner = null;
  if (state.slot) {
    state = { ...state, slot: null };
    emit();
  }
}

/** JoltRoot only: the bolt now rests in `id` (or nowhere). */
export function setJoltDocked(id: string | null, animate = false) {
  if (state.docked === id && !animate) return;
  state = {
    ...state,
    docked: id,
    dockEvent: id ? { id, animate, n: (state.dockEvent?.n ?? 0) + 1 } : state.dockEvent,
  };
  emit();
}

export function setJoltPaletteOpen(open: boolean) {
  if (state.paletteOpen === open) return;
  state = { ...state, paletteOpen: open };
  emit();
}

// The palette opener is registered by JoltRoot; bars and slots call openJolt().
let opener: (() => void) | null = null;
export function registerJoltOpener(fn: (() => void) | null) {
  opener = fn;
}
export function openJolt() {
  opener?.();
}
