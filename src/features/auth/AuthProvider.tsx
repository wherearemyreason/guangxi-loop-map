/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';

export type MemberRole = 'owner' | 'contributor';

interface AuthState {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: MemberRole | null;
  displayName: string;
  signOut: () => Promise<void>;
  refreshMembership: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function loadMembership(user: User | null) {
  if (!user) return { role: null, displayName: '' };
  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase.from('memberships').select('role, is_active').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  return {
    role: membership?.is_active ? membership.role as MemberRole : null,
    displayName: profile?.display_name ?? user.email?.split('@')[0] ?? '',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [role, setRole] = useState<MemberRole | null>(null);
  const [displayName, setDisplayName] = useState('');

  const refreshMembership = useCallback(async () => {
    const membership = await loadMembership(session?.user ?? null);
    setRole(membership.role);
    setDisplayName(membership.displayName);
  }, [session]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }
    let active = true;
    const applySession = async (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      const membership = await loadMembership(nextSession?.user ?? null);
      if (!active) return;
      setRole(membership.role);
      setDisplayName(membership.displayName);
      setLoading(false);
    };
    void supabase.auth.getSession().then(({ data }) => void applySession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => void applySession(nextSession), 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => ({
    configured: isSupabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    role,
    displayName,
    signOut: async () => { await supabase.auth.signOut(); },
    refreshMembership,
  }), [displayName, loading, refreshMembership, role, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
