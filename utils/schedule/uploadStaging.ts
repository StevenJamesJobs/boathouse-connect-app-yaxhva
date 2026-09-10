/**
 * The upload sheet → upload page handoff (s83).
 *
 * The ⚙ Schedule sheet's "Upload Schedules & View History" rows pick a file /
 * photos / a camera shot, then navigate to the Upload page, where the pick sits
 * in a STAGING card (title, optional week range, Scan). Nothing uploads until
 * Scan — so the page owns the whole pipeline and the sheet is only a launcher.
 *
 * The picked assets ride this module-level slot rather than route params (local
 * file URIs and page arrays don't belong in a URL). One-shot: `takeStagedPick`
 * clears it, so a stale pick can never resurface on a later visit.
 */
export interface StagedAsset {
  uri: string;
  name: string;
  mimeType: string;
  /** bytes when the picker reported it */
  size?: number | null;
}

export interface StagedPick {
  kind: 'file' | 'images' | 'camera';
  assets: StagedAsset[];
  /** the file's own name for a single PDF/image; "Schedule images (N pages)" otherwise */
  displayName: string;
  sourceType: 'pdf' | 'image';
  pageCount: number;
  /** first-page media type for parse-schedule */
  mediaType: string;
}

let staged: StagedPick | null = null;

export function setStagedPick(pick: StagedPick | null) {
  staged = pick;
}

export function takeStagedPick(): StagedPick | null {
  const p = staged;
  staged = null;
  return p;
}

export function peekStagedPick(): StagedPick | null {
  return staged;
}
