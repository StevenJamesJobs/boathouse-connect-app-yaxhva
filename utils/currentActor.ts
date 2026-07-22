// Volatile module-scope holder for the logged-in user's id, set by AuthContext
// on every auth change (mirrors setResolverActorId in utils/storageResolver.ts).
// Non-React utilities that invoke edge functions — utils/notificationHelpers.ts,
// utils/translateContent.ts — read it to attach `actor_id` to the request body,
// so the server can verify a real actor without every call site threading the id.
// Null while logged out; edge functions then reject (fail-closed).
let _currentActorId: string | null = null;

export function setCurrentActorId(id: string | null): void {
  _currentActorId = id;
}

export function getCurrentActorId(): string | null {
  return _currentActorId;
}
