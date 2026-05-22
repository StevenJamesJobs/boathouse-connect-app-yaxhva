
import { User } from '@/types/user';

export function isManagerOrOwner(user: User | null | undefined): boolean {
  return user?.role === 'manager' || user?.role === 'owner';
}

export function isOwner(user: User | null | undefined): boolean {
  return user?.role === 'owner';
}
