import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useLanguage } from '@/contexts/LanguageContext';
import { StepTitle, SwitchRow } from '@/components/content/FormKit';
import { categoryHue, priorityHue, EMBER, type ContentKind } from '@/components/content/contentVisuals';
import { fonts } from '@/constants/fonts';

export interface ReviewLine {
  key: string;
  iosIcon: string;
  androidIcon: string;
  label: string;
  /** Plain summary; `missing` paints it ember so a gap reads at a glance. */
  value: string;
  missing?: boolean;
  onPress: () => void;
}

export interface PreviewCardData {
  kind: ContentKind;
  title: string;
  body: string;
  coverUri: string | null;
  coverUrl: string | null;
  shape: 'square' | 'banner';
  priority?: string | null;
  category?: string | null;
  startDateTime?: Date | null;
  endDateTime?: Date | null;
  hasLink: boolean;
  attachmentLabel?: string | null;
  /** Where it lands — "Welcome › Today". */
  eyebrow: string;
}

interface ReviewStepProps {
  preview: PreviewCardData;
  lines: ReviewLine[];
  /** Create-only: the Notify staff switch. Omit in edit mode. */
  notify?: { value: boolean; onChange: (v: boolean) => void };
  /** Edit mode swaps the heading to "Review changes". */
  editing?: boolean;
}

/**
 * Review = preview + lines (s80 lockdown). The staff-facing Welcome card,
 * framed in glass with a mono eyebrow saying WHERE it lands, then one line per
 * step that jumps back, then Notify staff (create only).
 */
export default function ReviewStep({ preview, lines, notify, editing }: ReviewStepProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <View style={styles.frame}>
        <Text style={styles.eyebrow}>{preview.eyebrow.toUpperCase()}</Text>
        <ContentPreviewCard data={preview} />
      </View>
      <StepTitle
        title={editing ? t('content_editor.review_title_edit') : t('content_editor.review_title')}
        subtitle={editing ? t('content_editor.review_subtitle_edit') : t('content_editor.review_subtitle')}
      />
      <View style={styles.lines}>
        {lines.map((l) => (
          <Pressable key={l.key} style={styles.line} onPress={l.onPress}>
            <IconSymbol ios_icon_name={l.iosIcon} android_material_icon_name={l.androidIcon} size={15} color={colors.primary} />
            <Text style={styles.lineKey}>{l.label.toUpperCase()}</Text>
            <Text style={[styles.lineValue, l.missing && { color: EMBER_INK(colors) }]} numberOfLines={1}>
              {l.value}
            </Text>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={colors.textSecondary} />
          </Pressable>
        ))}
      </View>
      {!!notify && (
        <SwitchRow
          iosIcon="bell.fill"
          androidIcon="notifications"
          title={t('content_editor.notify_staff')}
          subtitle={t('content_editor.notify_staff_hint')}
          value={notify.value}
          onValueChange={notify.onChange}
        />
      )}
    </View>
  );
}

// Ember is a fixed-dark ink; on the page's own surfaces use the theme accent in
// light themes (the rulebook's ember contrast rule).
function EMBER_INK(colors: ReturnType<typeof useThemeColors>): string {
  return colors.background === '#181B21' || colors.background === '#1A2332' ? EMBER : colors.primary;
}

/** The Welcome-tab card as staff see it (PortalHome's card grammar, preview-sized). */
export function ContentPreviewCard({ data }: { data: PreviewCardData }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { language } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cover = data.coverUri ?? data.coverUrl;
  const locale = language === 'es' ? 'es' : 'en-US';
  const plainBody = data.body.replace(/<[^>]+>/g, '').trim();

  const whenParts: string[] = [];
  if (data.kind === 'announcement') {
    if (data.priority && data.priority !== 'none') whenParts.push(priorityLabel(data.priority, t));
    whenParts.push(t('content_editor.preview_today'));
  } else if (data.startDateTime) {
    whenParts.push(formatWhen(data.startDateTime, locale));
    if (data.endDateTime) {
      const sameDay = data.endDateTime.toDateString() === data.startDateTime.toDateString();
      whenParts.push(sameDay ? formatTime(data.endDateTime, locale) : formatWhen(data.endDateTime, locale));
    }
  } else {
    whenParts.push(t('content_editor.preview_no_dates'));
  }
  if (data.hasLink) whenParts.push(t('content_editor.preview_link'));
  if (data.attachmentLabel) whenParts.push(data.attachmentLabel);

  const badgeColor =
    data.kind === 'upcoming_event'
      ? categoryHue(data.category, isDark)
      : data.priority && data.priority !== 'none'
        ? priorityHue(data.priority, colors, isDark)
        : null;
  const badgeText =
    data.kind === 'upcoming_event'
      ? data.category === 'Entertainment'
        ? t('upcoming_events_editor:category_entertainment')
        : t('upcoming_events_editor:category_event')
      : data.priority && data.priority !== 'none'
        ? priorityLabel(data.priority, t)
        : null;

  return (
    <View style={styles.card}>
      {data.shape === 'banner' && !!cover && (
        <StorageImage source={{ uri: cover }} style={styles.bannerImage} resizeMode="cover" />
      )}
      <View style={styles.cardRow}>
        {data.shape !== 'banner' && !!cover && (
          <StorageImage source={{ uri: cover }} style={styles.squareImage} resizeMode="cover" />
        )}
        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {data.title || t('content_editor.preview_untitled')}
            </Text>
            <View style={styles.newPill}>
              <Text style={styles.newPillText}>{t('content_editor.new_badge')}</Text>
            </View>
            {!!badgeColor && !!badgeText && (
              <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                <Text style={styles.badgeText}>{badgeText.toUpperCase()}</Text>
              </View>
            )}
          </View>
          {!!plainBody && (
            <Text style={styles.cardBody2} numberOfLines={2}>
              {plainBody}
            </Text>
          )}
          <Text style={styles.when} numberOfLines={1}>
            {whenParts.join(' · ')}
          </Text>
        </View>
      </View>
    </View>
  );
}

function priorityLabel(priority: string, t: (k: string) => string): string {
  switch (priority) {
    case 'new':
      return t('common:priority_new');
    case 'important':
      return t('common:priority_important');
    case 'update':
      return t('common:priority_update');
    default:
      return priority;
  }
}

function formatWhen(d: Date, locale: string): string {
  return `${d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatTime(d, locale)}`;
}
function formatTime(d: Date, locale: string): string {
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrap: { gap: 12 },
    frame: {
      borderRadius: 15,
      padding: 10,
      paddingBottom: 6,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
      gap: 8,
    },
    eyebrow: {
      fontFamily: fonts.mono.semibold,
      fontSize: 8.5,
      letterSpacing: 1.4,
      color: colors.primary,
      marginHorizontal: 2,
    },
    card: {
      borderRadius: 16,
      padding: 11,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
      marginBottom: 4,
    },
    bannerImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, marginBottom: 10 },
    cardRow: { flexDirection: 'row', gap: 12 },
    squareImage: { width: 64, height: 64, borderRadius: 10 },
    cardBody: { flex: 1, minWidth: 0, justifyContent: 'center' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
    cardTitle: { flex: 1, flexShrink: 1, fontFamily: fonts.display.semibold, fontSize: 14.5, color: colors.text },
    newPill: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: '#EF4444' },
    newPillText: { fontFamily: fonts.mono.semibold, fontSize: 8, letterSpacing: 0.8, color: '#FFFFFF' },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7 },
    badgeText: { fontFamily: fonts.mono.semibold, fontSize: 8, letterSpacing: 0.6, color: '#FFFFFF' },
    cardBody2: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16, color: colors.textSecondary },
    when: { fontFamily: fonts.mono.medium, fontSize: 9.5, letterSpacing: 0.3, color: colors.primary, marginTop: 5 },
    lines: { gap: 8 },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 13,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    lineKey: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9,
      letterSpacing: 1,
      color: colors.textSecondary,
      width: 58,
    },
    lineValue: { flex: 1, minWidth: 0, fontFamily: fonts.body.regular, fontSize: 13, color: colors.text },
  });
