import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';

export interface HourlyPoint {
  /** Display label, e.g. "12 PM" (already localized by the caller). */
  label: string;
  /** Rounded temperature in °F. */
  temp: number;
  /** Chance of precipitation, 0–100. */
  precip: number;
  /** Full https URL for the condition icon. */
  icon: string;
}

interface HourlyForecastChartProps {
  hours: HourlyPoint[];
  colors: {
    text: string;
    textSecondary: string;
    primary: string;
    card: string;
    border?: string;
  };
}

type Mode = 'temp' | 'precip';

// ─── Layout constants ────────────────────────────────────────────────────────
const COL_W = 56; // width of each hour column
const COND_ICON = 30; // weather condition icon size
const CHART_H = 116; // height of the line-chart band
const PAD_TOP = 24; // headroom above the highest dot (for the value label)
const PAD_BOTTOM = 14; // room below the lowest dot
const DOT = 7;
const LINE_W = 2.5;
const PRECIP_COLOR = '#3498DB';

export default function HourlyForecastChart({ hours, colors }: HourlyForecastChartProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('temp');

  if (!hours || hours.length === 0) return null;

  const lineColor = mode === 'temp' ? colors.primary : PRECIP_COLOR;

  // ─── Build the value series + y-scale ──────────────────────────────────────
  const values = hours.map((h) => (mode === 'temp' ? h.temp : h.precip));

  let domainMin: number;
  let domainMax: number;
  if (mode === 'precip') {
    // Fixed 0–100% so "higher = more likely to rain" reads intuitively.
    domainMin = 0;
    domainMax = 100;
  } else {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(2, (max - min) * 0.18);
    domainMin = min - pad;
    domainMax = max + pad;
  }
  const span = domainMax - domainMin || 1;
  const innerTop = PAD_TOP;
  const innerBottom = CHART_H - PAD_BOTTOM;
  const innerRange = innerBottom - innerTop;

  const xAt = (i: number) => i * COL_W + COL_W / 2;
  const yAt = (value: number) => innerTop + ((domainMax - value) / span) * innerRange;

  const contentWidth = hours.length * COL_W;

  // ─── Connecting line segments (SVG-free: rotated Views about their midpoint) ─
  const segments = hours.slice(0, -1).map((_, i) => {
    const x1 = xAt(i);
    const y1 = yAt(values[i]);
    const x2 = xAt(i + 1);
    const y2 = yAt(values[i + 1]);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    return { key: i, len, angleDeg, left: midX - len / 2, top: midY - LINE_W / 2 };
  });

  return (
    <View style={styles.section}>
      {/* Header: title + Temp/Precip toggle */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>{t('weather.hourly_forecast')}</Text>
        <View style={[styles.toggle, { borderColor: colors.primary + '40' }]}>
          {(['temp', 'precip'] as Mode[]).map((m) => {
            const active = mode === m;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                activeOpacity={0.8}
                style={[styles.toggleBtn, active && { backgroundColor: colors.primary }]}
              >
                <IconSymbol
                  ios_icon_name={m === 'temp' ? 'thermometer' : 'drop.fill'}
                  android_material_icon_name={m === 'temp' ? 'thermostat' : 'water-drop'}
                  size={13}
                  color={active ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[styles.toggleText, { color: active ? '#FFFFFF' : colors.textSecondary }]}
                >
                  {t(m === 'temp' ? 'weather.hourly_temp' : 'weather.hourly_precip')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: contentWidth }}>
          {/* Top row: hour label + condition icon per column */}
          <View style={styles.topRow}>
            {hours.map((h, i) => (
              <View key={i} style={[styles.topCol, { width: COL_W }]}>
                <Text style={[styles.hourLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                  {h.label}
                </Text>
                <Image source={{ uri: h.icon }} style={styles.condIcon} resizeMode="contain" />
              </View>
            ))}
          </View>

          {/* Chart band: connecting line + dots + value labels */}
          <View style={{ width: contentWidth, height: CHART_H }}>
            {/* faint vertical gridlines */}
            {hours.map((_, i) => (
              <View
                key={`grid-${i}`}
                style={[
                  styles.gridline,
                  { left: xAt(i), backgroundColor: colors.textSecondary + '14' },
                ]}
              />
            ))}

            {/* line segments */}
            {segments.map((s) => (
              <View
                key={`seg-${s.key}`}
                style={{
                  position: 'absolute',
                  left: s.left,
                  top: s.top,
                  width: s.len,
                  height: LINE_W,
                  borderRadius: LINE_W / 2,
                  backgroundColor: lineColor,
                  transform: [{ rotate: `${s.angleDeg}deg` }],
                }}
              />
            ))}

            {/* dots + value labels */}
            {hours.map((h, i) => {
              const x = xAt(i);
              const y = yAt(values[i]);
              return (
                <React.Fragment key={`pt-${i}`}>
                  <View
                    style={[
                      styles.valueLabel,
                      { left: x - COL_W / 2, top: y - 22, width: COL_W },
                    ]}
                  >
                    {mode === 'precip' && (
                      <IconSymbol
                        ios_icon_name="drop.fill"
                        android_material_icon_name="water-drop"
                        size={10}
                        color={PRECIP_COLOR}
                      />
                    )}
                    <Text style={[styles.valueText, { color: colors.text }]}>
                      {mode === 'temp' ? `${h.temp}°` : `${h.precip}%`}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.dot,
                      { left: x - DOT / 2, top: y - DOT / 2, backgroundColor: lineColor, borderColor: colors.card },
                    ]}
                  />
                </React.Fragment>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  toggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  topRow: {
    flexDirection: 'row',
  },
  topCol: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
    paddingBottom: 6,
  },
  hourLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  condIcon: {
    width: COND_ICON,
    height: COND_ICON,
  },
  gridline: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
  },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1.5,
  },
  valueLabel: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  valueText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
