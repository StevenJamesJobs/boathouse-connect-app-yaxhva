import React from 'react';
import { Text, TextStyle } from 'react-native';

/**
 * Parses text containing simple HTML-like formatting tags and renders them
 * as styled React Native Text components.
 *
 * Supported tags:
 *   <b>bold</b>  <i>italic</i>  <u>underline</u>  <s>strikethrough</s>
 *   <small>smaller text</small>  <big>larger text</big>
 *
 * Supports nested tags like: <b><i>bold italic</i></b>
 * Preserves line breaks (\n).
 * Falls back to plain text for any unrecognized or malformed tags.
 */

interface FormattedTextProps {
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
}

interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  small?: boolean;
  big?: boolean;
}

function parseFormattedText(input: string): TextSegment[] {
  const segments: TextSegment[] = [];

  // Stack to track open tags
  const tagStack: string[] = [];

  function getCurrentStyles() {
    const styles: Partial<TextSegment> = {};
    for (const tag of tagStack) {
      if (tag === 'b') styles.bold = true;
      if (tag === 'i') styles.italic = true;
      if (tag === 'u') styles.underline = true;
      if (tag === 's') styles.strikethrough = true;
      if (tag === 'small') styles.small = true;
      if (tag === 'big') styles.big = true;
    }
    return styles;
  }

  // Match single-char tags (b, i, u, s) and multi-char tags (small, big)
  const tagRegex = /<\/?(?:b|i|u|s|small|big)>/gi;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = tagRegex.exec(input)) !== null) {
    // Add text before this tag
    if (match.index > lastIndex) {
      const text = input.substring(lastIndex, match.index);
      if (text) {
        segments.push({ text, ...getCurrentStyles() });
      }
    }

    const fullTag = match[0];
    const isClosing = fullTag.startsWith('</');
    // Extract tag name: strip < > / characters
    const tagName = fullTag.replace(/<\/?|>/g, '').toLowerCase();

    if (isClosing) {
      // Find and remove matching open tag from stack
      const stackIndex = tagStack.lastIndexOf(tagName);
      if (stackIndex !== -1) {
        tagStack.splice(stackIndex, 1);
      }
    } else {
      tagStack.push(tagName);
    }

    lastIndex = match.index + fullTag.length;
  }

  // Add remaining text after last tag
  if (lastIndex < input.length) {
    const text = input.substring(lastIndex);
    if (text) {
      segments.push({ text, ...getCurrentStyles() });
    }
  }

  // If no tags found at all, return the whole string as one segment
  if (segments.length === 0 && input.length > 0) {
    segments.push({ text: input });
  }

  return segments;
}

/** Base font size ratio adjustments for <small> and <big> tags */
const SIZE_SCALE_SMALL = 0.82;
const SIZE_SCALE_BIG = 1.22;

export default function FormattedText({ children, style, numberOfLines }: FormattedTextProps) {
  // Extract string content from children (handles whitespace around expressions)
  const text = typeof children === 'string' ? children.trim() :
    Array.isArray(children) ? children.filter(c => typeof c === 'string' && c.trim()).join('').trim() :
    null;

  if (!text || typeof text !== 'string') {
    return <Text style={style} numberOfLines={numberOfLines}>{children || ''}</Text>;
  }

  // Quick check: if no tags at all, just render plain text
  if (!/<\/?(?:b|i|u|s|small|big)>/i.test(text)) {
    return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
  }

  // Resolve the base font size from the style prop
  const resolvedStyle = Array.isArray(style) ? Object.assign({}, ...style) : (style || {});
  const baseFontSize = resolvedStyle.fontSize || 14;

  const segments = parseFormattedText(text);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((segment, index) => {
        const segmentStyle: TextStyle = {};
        if (segment.bold) segmentStyle.fontWeight = 'bold';
        if (segment.italic) segmentStyle.fontStyle = 'italic';
        if (segment.underline) segmentStyle.textDecorationLine = 'underline';
        if (segment.strikethrough) {
          segmentStyle.textDecorationLine = segment.underline
            ? 'underline line-through'
            : 'line-through';
        }
        if (segment.small) segmentStyle.fontSize = Math.round(baseFontSize * SIZE_SCALE_SMALL);
        if (segment.big) segmentStyle.fontSize = Math.round(baseFontSize * SIZE_SCALE_BIG);

        const hasStyle = segment.bold || segment.italic || segment.underline ||
          segment.strikethrough || segment.small || segment.big;

        return hasStyle ? (
          <Text key={index} style={segmentStyle}>
            {segment.text}
          </Text>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        );
      })}
    </Text>
  );
}

// Also export the parser for use in truncation or other utilities
export { parseFormattedText };

/**
 * Strips all formatting tags from text, returning plain text.
 * Useful for previews, search, and length calculations.
 */
export function stripFormattingTags(text: string): string {
  if (!text) return '';
  return text.replace(/<\/?(?:b|i|u|s|small|big)>/gi, '');
}
