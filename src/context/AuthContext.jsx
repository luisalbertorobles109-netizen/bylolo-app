import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = cargando
  const [profile, setProfile] = useState(null);
  const [salonSettings, setSalonSettings] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setProfile(null); return; }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => {
        setProfile(data || null);
        if (data?.theme) document.documentElement.setAttribute('data-theme', data.theme);
        if (data?.accent) document.documentElement.setAttribute('data-accent', data.accent);
      });
    supabase.from('salon_settings').select('*').eq('id', 1).single()
      .then(({ data }) => setSalonSettings(data || null));
  }, [session]);

  const value = {
    session, profile, salonSettings,
    isAdmin: profile?.role === 'Admin',
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, fullName) => supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } }),
    signOut: () => supabase.auth.signOut(),
    updatePrefs: async (theme, accent) => {
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.setAttribute('data-accent', accent);
      if (session?.user) await supabase.from('profiles').update({ theme, accent }).eq('id', session.user.id);
      setProfile(p => p ? { ...p, theme, accent } : p);
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
