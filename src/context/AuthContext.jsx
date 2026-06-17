import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// El "artista activo" (quien fichó en el panel) se guarda en el dispositivo
// para que la sesión persista hasta que se cambie manualmente.
const ACTIVE_KEY = 'bylolo_active_artist';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = cargando; null = sin login; objeto = cuenta Salón logueada
  const [salonSettings, setSalonSettings] = useState(null);
  const [activeArtist, setActiveArtist] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch { return null; }
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setSalonSettings(null); return; }
    supabase.from('salon_settings').select('*').eq('id', 1).single()
      .then(({ data }) => setSalonSettings(data || null));
  }, [session]);

  // Aplica el tema/acento del artista activo
  useEffect(() => {
    if (activeArtist?.accent) document.documentElement.setAttribute('data-accent', activeArtist.accent);
    if (activeArtist?.theme) document.documentElement.setAttribute('data-theme', activeArtist.theme);
  }, [activeArtist]);

  function selectArtist(artist) {
    // artist: { id, full_name, role, accent }
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(artist));
    setActiveArtist(artist);
  }
  function exitArtist() {
    localStorage.removeItem(ACTIVE_KEY);
    setActiveArtist(null);
  }

  const value = {
    session,
    salonSettings,
    activeArtist,                       // el artista que fichó (o null si está en el panel de selección)
    profile: activeArtist,              // alias para compatibilidad con el resto de la app
    isAdmin: activeArtist?.role === 'Admin',
    selectArtist,
    exitArtist,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, fullName) => supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } }),
    signOutDevice: async () => { exitArtist(); await supabase.auth.signOut(); },
    // mantener firma vieja por compatibilidad: "salir" en la app = volver al panel de selección
    signOut: async () => { exitArtist(); },
    updatePrefs: async (theme, accent) => {
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.setAttribute('data-accent', accent);
      if (activeArtist?.id) {
        await supabase.from('profiles').update({ theme, accent }).eq('id', activeArtist.id);
        const updated = { ...activeArtist, theme, accent };
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(updated));
        setActiveArtist(updated);
      }
    },
    refreshSettings: () => supabase.from('salon_settings').select('*').eq('id', 1).single().then(({ data }) => setSalonSettings(data || null)),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
