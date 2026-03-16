import React, { useRef, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  TextInput,
  StyleSheet,
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
} from 'react-native';

/**
 * A formatting toolbar for TextInput fields.
 * Supports: Bold, Italic, Underline, Strikethrough, Small text, Large text.
 *
 * Usage:
 *   const [text, setText] = useState('');
 *   const textInputRef = useRef<TextInput>(null);
 *   const [selection, setSelection] = useState({ start: 0, end: 0 });
 *
 *   <RichTextToolbar
 *     text={text}
 *     onChangeText={setText}
 *     selection={selection}
 *     textInputRef={textInputRef}
 *   />
 *   <TextInput
 *     ref={textInputRef}
 *     value={text}
 *     onChangeText={setText}
 *     onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
 *     selection={selection}
 *   />
 */

interface RichTextToolbarProps {
  text: string;
  onChangeText: (text: string) => void;
  selection: { start: number; end: number };
  onSelectionChange?: (selection: { start: number; end: number }) => void;
  textInputRef?: React.RefObject<TextInput | null>;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
}

type FormatTag = 'b' | 'i' | 'u' | 's' | 'small' | 'big';

export default function RichTextToolbar({
  text,
  onChangeText,
  selection,
  onSelectionChange,
  textInputRef,
  accentColor = '#4A90D9',
  backgroundColor = '#F0F0F0',
  textColor = '#1A1A1A',
}: RichTextToolbarProps) {
  const applyFormat = useCallback(
    (tag: FormatTag) => {
      const { start, end } = selection;

      if (start === end) {
        // No selection — insert empty tag pair and place cursor inside
        const openTag = `<${tag}>`;
        const closeTag = `</${tag}>`;
        const before = text.substring(0, start);
        const after = text.substring(start);
        const newText = before + openTag + closeTag + after;
        onChangeText(newText);

        // Move cursor between the tags
        const newCursorPos = start + openTag.length;
        setTimeout(() => {
          onSelectionChange?.({ start: newCursorPos, end: newCursorPos });
          textInputRef?.current?.focus();
        }, 50);
        return;
      }

      // Has selection — check if already wrapped with this tag
      const selectedText = text.substring(start, end);
      const openTag = `<${tag}>`;
      const closeTag = `</${tag}>`;

      // Check if selected text is already wrapped
      if (selectedText.startsWith(openTag) && selectedText.endsWith(closeTag)) {
        // Remove the tag — unwrap
        const unwrapped = selectedText.slice(openTag.length, -closeTag.length);
        const newText = text.substring(0, start) + unwrapped + text.substring(end);
        onChangeText(newText);
        const newEnd = start + unwrapped.length;
        setTimeout(() => {
          onSelectionChange?.({ start, end: newEnd });
          textInputRef?.current?.focus();
        }, 50);
        return;
      }

      // Check if the tags are just outside the selection
      const beforeStart = Math.max(0, start - openTag.length);
      const afterEnd = Math.min(text.length, end + closeTag.length);
      const expandedBefore = text.substring(beforeStart, start);
      const expandedAfter = text.substring(end, afterEnd);

      if (expandedBefore === openTag && expandedAfter === closeTag) {
        // Tags are right outside selection — remove them
        const newText = text.substring(0, beforeStart) + selectedText + text.substring(afterEnd);
        onChangeText(newText);
        const newStart = beforeStart;
        const newEnd = beforeStart + selectedText.length;
        setTimeout(() => {
          onSelectionChange?.({ start: newStart, end: newEnd });
          textInputRef?.current?.focus();
        }, 50);
        return;
      }

      // Wrap selection with tags
      const wrapped = openTag + selectedText + closeTag;
      const newText = text.substring(0, start) + wrapped + text.substring(end);
      onChangeText(newText);

      // Keep selection on the text (inside the tags)
      const newStart = start + openTag.length;
      const newEnd = newStart + selectedText.length;
      setTimeout(() => {
        onSelectionChange?.({ start: newStart, end: newEnd });
        textInputRef?.current?.focus();
      }, 50);
    },
    [text, selection, onChangeText, onSelectionChange, textInputRef]
  );

  return (
    <View style={[styles.toolbar, { backgroundColor }]}>
      {/* Bold */}
      <TouchableOpacity
        style={styles.formatButton}
        onPress={() => applyFormat('b')}
        activeOpacity={0.6}
      >
        <Text style={[styles.formatButtonText, styles.boldText, { color: textColor }]}>B</Text>
      </TouchableOpacity>

      {/* Italic */}
      <TouchableOpacity
        style={styles.formatButton}
        onPress={() => applyFormat('i')}
        activeOpacity={0.6}
      >
        <Text style={[styles.formatButtonText, styles.italicText, { color: textColor }]}>I</Text>
      </TouchableOpacity>

      {/* Underline */}
      <TouchableOpacity
        style={styles.formatButton}
        onPress={() => applyFormat('u')}
        activeOpacity={0.6}
      >
        <Text style={[styles.formatButtonText, styles.underlineText, { color: textColor }]}>U</Text>
      </TouchableOpacity>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: textColor + '30' }]} />

      {/* Strikethrough */}
      <TouchableOpacity
        style={styles.formatButton}
        onPress={() => applyFormat('s')}
        activeOpacity={0.6}
      >
        <Text style={[styles.formatButtonText, styles.strikethroughText, { color: textColor }]}>S</Text>
      </TouchableOpacity>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: textColor + '30' }]} />

      {/* Small text */}
      <TouchableOpacity
        style={styles.formatButton}
        onPress={() => applyFormat('small')}
        activeOpacity={0.6}
      >
        <Text style={[styles.sizeButtonText, styles.smallButtonText, { color: textColor }]}>A</Text>
      </TouchableOpacity>

      {/* Large text */}
      <TouchableOpacity
        style={styles.formatButton}
        onPress={() => applyFormat('big')}
        activeOpacity={0.6}
      >
        <Text style={[styles.sizeButtonText, styles.bigButtonText, { color: textColor }]}>A</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 4,
    gap: 4,
    marginBottom: 6,
    alignItems: 'center',
  },
  formatButton: {
    width: 36,
    height: 36,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  formatButtonText: {
    fontSize: 18,
  },
  boldText: {
    fontWeight: 'bold',
  },
  italicText: {
    fontStyle: 'italic',
    fontFamily: 'serif',
  },
  underlineText: {
    textDecorationLine: 'underline',
  },
  strikethroughText: {
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 22,
    marginHorizontal: 2,
  },
  sizeButtonText: {
    fontWeight: '600',
  },
  smallButtonText: {
    fontSize: 12,
  },
  bigButtonText: {
    fontSize: 22,
  },
});
