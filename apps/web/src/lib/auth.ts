import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { queryClient } from './query';
import type { Counts, Me, Meta } from './types';

export const meKey = ['auth', 'me'] as const;

export function useMe() {
  const q = useQuery({
    queryKey: meKey,
    queryFn: () => api.get<{ user: Me | null }>('/auth/me').then((r) => r.user),
    staleTime: 5 * 60_000,
  });
  return { me: q.data ?? null, loading: q.isPending, error: q.isError ? q.error : null, refetch: () => q.refetch() };
}

/** Use inside authenticated routes only. */
export function useAuthedMe(): Me {
  const { me } = useMe();
  if (!me) throw new Error('useAuthedMe used outside an authenticated route');
  return me;
}

export function setMe(user: Me | null) {
  queryClient.setQueryData(meKey, user);
}

/**
 * Wipe every cached query except the one holding the given user, then seed it.
 * Called on successful login/signup so a previous identity's feeds, profiles
 * and messages never leak into the new session.
 */
export function setIdentity(user: Me) {
  queryClient.clear();
  queryClient.setQueryData(meKey, user);
}

export function useCounts(enabled = true) {
  return useQuery({
    queryKey: ['counts'],
    queryFn: () => api.get<Counts>('/me/counts'),
    enabled,
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: () => api.get<Meta>('/meta'), staleTime: Infinity });
}
