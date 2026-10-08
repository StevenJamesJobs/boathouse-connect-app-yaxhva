import React from 'react';
import ChecklistEditorScreen from '@/components/checklist/ChecklistEditorScreen';

// s91: thin route wrapper — the screen lives in components/checklist.
export default function BartenderOpeningChecklistEditorScreen() {
  return <ChecklistEditorScreen kind="bartender" type="opening" />;
}
