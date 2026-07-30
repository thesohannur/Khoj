import { supabase } from './supabase';

// Every visitor needs at least a session (anonymous is fine) so requests
// go through as the `authenticated` Postgres role rather than the bare
// `anon` role — see the persons/reports/matches RLS policies.
export async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

export function isRealUser(session) {
  return !!session?.user && !session.user.is_anonymous;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
  return ensureSession();
}
