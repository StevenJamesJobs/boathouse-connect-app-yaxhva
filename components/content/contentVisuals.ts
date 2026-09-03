/**
 * The Content Kit (s80) — Announcements · Special Features · Upcoming Events.
 *
 * Every content-family colour and cap lives HERE (the games/quiz/tips/tools
 * rule: never re-literal a family colour in a screen). The family itself
 * follows the theme tint — house content wears the house colour, like Guides —
 * so only the two category hues and the three priority hues are fixed.
 */
import type { ThemeColorSet } from '@/styles/commonStyles';
import type { UploadPurpose } from '@/utils/storageBroker';

export type ContentKind = 'announcement' | 'special_feature' | 'upcoming_event';

/**
 * Item caps. CLIENT-SIDE ONLY — no RPC counts rows (verified s80), so a change
 * here is the whole change. Announcements and Specials were 10 / 15; Steve
 * raised both to 25 in s80. Events stay at 100.
 */
export const CONTENT_CAPS: Record<ContentKind, number> = {
  announcement: 25,
  special_feature: 25,
  upcoming_event: 100,
};

/** One-time attachments: PDF or image, 20 MB (Steve's s80 cap; the buckets
 *  and the broker gates were widened to match). */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_PICKER_TYPES = ['application/pdf', 'image/*'];

/** Each post type owns one bucket; thumbnail, extra images and the attachment
 *  all live there, which is what lets one retire path clear them together. */
export const CONTENT_BUCKET: Record<ContentKind, string> = {
  announcement: 'announcements',
  special_feature: 'special-features',
  upcoming_event: 'upcoming-events',
};

export const CONTENT_ATTACHMENT_PURPOSE: Record<ContentKind, UploadPurpose> = {
  announcement: 'announcement_attachment',
  special_feature: 'special_feature_attachment',
  upcoming_event: 'upcoming_event_attachment',
};

export const CONTENT_IMAGE_PURPOSE: Record<ContentKind, UploadPurpose> = {
  announcement: 'announcement_image',
  special_feature: 'special_feature_image',
  upcoming_event: 'upcoming_event_image',
};

export type EventCategory = 'Event' | 'Entertainment';
export type AnnouncementPriority = 'none' | 'new' | 'important' | 'update';
export type AnnouncementVisibility = 'everyone' | 'employees' | 'managers' | 'none';

export const PRIORITY_LEVELS: AnnouncementPriority[] = ['none', 'new', 'important', 'update'];
export const VISIBILITY_OPTIONS: AnnouncementVisibility[] = ['everyone', 'employees', 'managers', 'none'];

/**
 * Category hues — Event azure, Entertainment violet (the mockup's --azure /
 * --violet; light themes take the deeper step so the text passes on white).
 * Deliberately NOT colors.blue: that token is the NEW-badge blue and changes
 * with the palette, while the category pair must read the same everywhere.
 */
export function categoryHue(category: string | null | undefined, isDark: boolean): string {
  if (category === 'Entertainment') return isDark ? '#7C5CE0' : '#6D28D9';
  return isDark ? '#3B82F6' : '#2563EB';
}

/** Priority badge hues — new gold · important red · update azure. */
export function priorityHue(priority: string | null | undefined, colors: ThemeColorSet, isDark: boolean): string {
  switch (priority) {
    case 'new':
      return isDark ? '#F59E0B' : '#B45309';
    case 'important':
      return '#EF4444';
    case 'update':
      return isDark ? '#3B82F6' : '#2563EB';
    default:
      return colors.textSecondary;
  }
}

/**
 * Kind badge hues for the detail modal's title pill (s81 round 3) — FIXED
 * pairs, not the theme tint: the pill sits on a photo (white ink) and Mono's
 * tint is near-white. Announcement ember-orange · Special Feature emerald ·
 * Upcoming Event = its category hue.
 */
export function kindHue(kind: ContentKind, category: string | null | undefined, isDark: boolean): string {
  switch (kind) {
    case 'announcement':
      return isDark ? '#F97316' : '#C2410C';
    case 'special_feature':
      return isDark ? '#10A56F' : '#087A52';
    default:
      return categoryHue(category, isDark);
  }
}

/** The steps rail's "done" green (the tips emerald pair). */
export function doneHue(isDark: boolean): string {
  return isDark ? '#10A56F' : '#087A52';
}

/** Ember eyebrow on fixed-dark surfaces and the review "missing" ink. */
export const EMBER = '#FFB07A';
