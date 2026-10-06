import React, { useCallback } from 'react';
import {
  FlatList,
  ScrollView,
  type FlatListProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSheetBodyNative, useSheetBodyScroll } from '@/components/sheetDismiss';

/**
 * The body scrollable for a GlassSheet host that scrolls its OWN body
 * (`scroll={false}`): a ScrollView / FlatList that opts itself in to the s89
 * swipe-to-dismiss (components/sheetDismiss.tsx), so the sheet knows when the
 * body is at the top and may take a downward drag.
 *
 * Why a component and not a bare `useSheetBodyScroll()` in the host: the hook
 * reads the sheet's context, and a host calls its hooks from ABOVE the
 * <GlassSheet> it renders — outside the provider, where the context is null
 * and the opt-in silently does nothing. These call the hook from a component
 * that is MOUNTED INSIDE the sheet body, where the provider is in reach.
 *
 * The host's own `onScroll` is kept (called first); the sheet's
 * `scrollEventThrottle` and `bounces={false}` win — an at-top pull must have
 * no rubber-band to fight. Plain lists only: a drag list (DraggableFlatList)
 * or a wheel is never wired — header-only dismiss is correct for those.
 */
type ScrollHandler = (e: NativeSyntheticEvent<NativeScrollEvent>) => void;

function useBodyScrollProps(own: ScrollHandler | undefined) {
  const body = useSheetBodyScroll();
  const onScroll = useCallback<ScrollHandler>(
    (e) => {
      own?.(e);
      body.onScroll(e);
    },
    [own, body],
  );
  return { ...body, onScroll };
}

// The scrollable's native gesture is declared simultaneous with the sheet's
// dismiss pan (see sheetDismiss.tsx) — outside a sheet there is none to wrap.
export function SheetBodyScrollView(props: ScrollViewProps) {
  const body = useBodyScrollProps(props.onScroll);
  const native = useSheetBodyNative();
  const view = <ScrollView {...props} {...body} />;
  return native ? <GestureDetector gesture={native}>{view}</GestureDetector> : view;
}

export function SheetBodyFlatList<T>(props: FlatListProps<T>) {
  const body = useBodyScrollProps(props.onScroll);
  const native = useSheetBodyNative();
  const view = <FlatList<T> {...props} {...body} />;
  return native ? <GestureDetector gesture={native}>{view}</GestureDetector> : view;
}
