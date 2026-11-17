'use client';
import { useCallback } from 'react';
import { useFirebase } from '@/firebase';

export function useCommunityApi() {
  const { user } = useFirebase();
  return useCallback(async <T,>(url: string, method = 'GET', body?: unknown): Promise<T> => {
    if (!user) throw new Error('Sign in to continue.');
    const response = await fetch(url, {
      method, cache: 'no-store',
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? 'Request failed. Please retry.');
    return result as T;
  }, [user]);
}
