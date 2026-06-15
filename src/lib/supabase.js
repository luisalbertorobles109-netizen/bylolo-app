import { createClient } from '@supabase/supabase-js';

// Proyecto: ByLolo CRM (Supabase). La clave "anon" es pública por diseño:
// la seguridad real la dan las políticas RLS de la base de datos.
const SUPABASE_URL = 'https://kzorrmybposfmlmtyvsv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6b3JybXlicG9zZm1sbXR5dnN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNTk3NDIsImV4cCI6MjA5NjgzNTc0Mn0.HFduWKvGUxWe_pEMQIqIYbq7JufC6P_WQh-sVY7Myh4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
