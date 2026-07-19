import React, { memo, useEffect, useReducer, useState } from 'react';
import {
  Image as RNImage,
  ImageProps as RNImageProps,
  ImageSourcePropType,
  ImageErrorEventData,
  NativeSyntheticEvent,
} from 'react-native';
import { Image as ExpoImage, ImageProps as ExpoImageProps } from 'expo-image';
import {
  isOurStorageUrl,
  reportImageError,
  resolveUrlSync,
  subscribeToUrl,
} from '@/utils/storageResolver';

/**
 * B4b (session 49): drop-in image leaves that resolve stored storage URLs via
 * utils/storageResolver.ts. Two wrappers so every render site keeps its
 * existing library and props (`<Image` -> `<StorageImage` / `<StorageExpoImage`
 * is the whole edit — no prop-semantics change, no row-component extraction).
 *
 * Public mode (today): resolveUrlSync returns the same string synchronously —
 * the rendered tree is byte-identical to the raw <Image>, zero added async.
 * Private mode (post-flip): renders empty (or `fallbackSource`) until the
 * batched signed URL lands, then re-renders just this leaf. onError feeds
 * reportImageError — that is how the fleet discovers the flip — then chains the
 * caller's handler.
 *
 * Note: `recyclingKey` is deliberately NOT set on the expo wrapper (nothing
 * sets it today — byte-identical rule). If recycled-cell flashes appear on
 * re-mints after the flip, adopting recyclingKey={storedUrl} is the fix.
 */

type StorageImageExtras = {
  /** updated_at-style cache-bust; folded into ?v= (public) or the cache key (private). */
  version?: string | null;
  /** Rendered when the URL cannot resolve (private+unauthed) or the image errors. */
  fallbackSource?: ImageSourcePropType;
};

// Many call sites pass { uri: string | null } from nullable helpers — RN's own
// Image typing rejects that (it was pre-existing baseline noise as TS2769);
// accept it here so those sites stay byte-identical AND type-clean.
type LooseUriSource = { uri: string | null | undefined };
type StorageRNImageProps = Omit<RNImageProps, 'source'> & {
  source?: RNImageProps['source'] | LooseUriSource | null;
} & StorageImageExtras;

/** Sync resolve + subscription: re-renders when a signed URL lands/renews or the mode flips. */
export function useStorageUrl(
  url: string | null | undefined,
  version?: string | null
): string | null {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!isOurStorageUrl(url)) return;
    return subscribeToUrl(url, version ?? null, force);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, version]);
  return resolveUrlSync(url ?? null, version ?? null);
}

function uriFromSource(source: unknown): string | null {
  if (typeof source === 'string') return source;
  if (
    source &&
    typeof source === 'object' &&
    !Array.isArray(source) &&
    typeof (source as { uri?: unknown }).uri === 'string'
  ) {
    return (source as { uri: string }).uri;
  }
  return null;
}

export const StorageImage = memo(function StorageImage(props: StorageRNImageProps) {
  const { version, fallbackSource, source, onError, ...rest } = props;
  const uri = uriFromSource(source);
  const isStorage = isOurStorageUrl(uri);
  const resolved = useStorageUrl(isStorage ? uri : null, version ?? null);
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    setErrored(false);
  }, [uri]);

  const handleError = (e: NativeSyntheticEvent<ImageErrorEventData>) => {
    if (isStorage) reportImageError(uri);
    if (fallbackSource) setErrored(true);
    onError?.(e);
  };

  if (fallbackSource && (errored || (isStorage && resolved === null))) {
    return <RNImage {...rest} source={fallbackSource} />;
  }
  const finalSource = isStorage
    ? ({ ...(source as object), uri: resolved ?? undefined } as RNImageProps['source'])
    : (source as RNImageProps['source']);
  return <RNImage {...rest} source={finalSource ?? undefined} onError={handleError} />;
});

export const StorageExpoImage = memo(function StorageExpoImage(
  props: ExpoImageProps & StorageImageExtras
) {
  const { version, fallbackSource, source, onError, ...rest } = props;
  const uri = uriFromSource(source);
  const isStorage = isOurStorageUrl(uri);
  const resolved = useStorageUrl(isStorage ? uri : null, version ?? null);
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    setErrored(false);
  }, [uri]);

  const handleError = (e: Parameters<NonNullable<ExpoImageProps['onError']>>[0]) => {
    if (isStorage) reportImageError(uri);
    if (fallbackSource) setErrored(true);
    onError?.(e);
  };

  if (fallbackSource && (errored || (isStorage && resolved === null))) {
    return <ExpoImage {...rest} source={fallbackSource as ExpoImageProps['source']} />;
  }
  let finalSource: ExpoImageProps['source'] = source as ExpoImageProps['source'];
  if (isStorage) {
    finalSource =
      typeof source === 'string'
        ? resolved ?? undefined
        : ({ ...(source as object), uri: resolved ?? undefined } as ExpoImageProps['source']);
  }
  return <ExpoImage {...rest} source={finalSource} onError={handleError} />;
});
