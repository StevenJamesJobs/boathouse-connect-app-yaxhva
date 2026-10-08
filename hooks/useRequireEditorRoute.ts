import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useAssistantEditor, type AssistantEditorKey } from '@/hooks/useAssistantEditor';

/**
 * s91 — the route-level guard for an assistant EDITOR screen (recipes +
 * checklists) that a granted job title may open: the useRequireManagerRoute
 * idiom, widened to the family's editor grant. Owners / managers pass at once;
 * an employee passes once get_my_assistant_editor_keys names the family, and
 * is bounced to their portal when it doesn't. No-ops while the user is null or
 * the grant is still loading (never bounce on a cold start).
 */
export function useRequireEditorRoute(key: AssistantEditorKey): boolean {
  const { user } = useAuth();
  const router = useRouter();
  const { canEdit, isLoading } = useAssistantEditor();
  const allowed = !user || isLoading || canEdit(key);

  useEffect(() => {
    if (!allowed) {
      router.replace('/(portal)/employee');
    }
  }, [allowed, router]);

  return allowed;
}
