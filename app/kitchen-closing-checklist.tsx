import React from 'react';
import ChecklistScreen from '@/components/checklist/ChecklistScreen';

// s91: thin route wrapper — the screen lives in components/checklist.
export default function KitchenClosingChecklistScreen() {
  return <ChecklistScreen kind="kitchen" type="closing" />;
}
