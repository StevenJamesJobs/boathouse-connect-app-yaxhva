import React, { useRef, useState } from 'react';
import { View, TextInput } from 'react-native';
import RichTextToolbar from '@/components/RichTextToolbar';
import { FieldLabel, GlassTextInput } from '@/components/content/FormKit';

interface RichTextFieldProps {
  label: string;
  labelTrailing?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

/**
 * Themed RichTextToolbar + glass textarea, owning the selection plumbing the
 * toolbar needs (each editor used to keep its own ref + selection state).
 */
export default function RichTextField({ label, labelTrailing, value, onChangeText, placeholder }: RichTextFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  return (
    <View>
      <FieldLabel label={label} trailing={labelTrailing} />
      <RichTextToolbar
        text={value}
        onChangeText={onChangeText}
        selection={selection}
        onSelectionChange={setSelection}
        textInputRef={inputRef}
      />
      <GlassTextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        placeholder={placeholder}
        multiline
        numberOfLines={5}
      />
    </View>
  );
}
