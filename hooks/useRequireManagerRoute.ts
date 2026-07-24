import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';

// B8: route-level guard for manager/owner-only PUSHED screens. The portal tab shells
// have live layout guards, but pushed stack screens historically had none — so a
// demoted user already on (or deep-linking back into) an editor kept a fully rendered
// manager UI, limited only by server RPC authz. Server gates always hold; this closes
// the UI side: employees are bounced to their portal. Mirrors the exam-answer-review
// idiom (effect keyed on role). No-ops while user is null — logout/loading routing is
// the root layout's concern. Finer owner-vs-manager gating stays inside each screen.
export function useRequireManagerRoute(): boolean {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = !user || isManagerOrOwner(user);

  useEffect(() => {
    if (!allowed) {
      router.replace('/(portal)/employee');
    }
  }, [allowed, router]);

  return allowed;
}
