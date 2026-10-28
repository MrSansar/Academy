import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = createClient<Database>(
  SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_ANON_KEY || 'not-configured',
  {
    auth: {
      // PKCE puts the email-link code in ?code=, which leaves the #/route hash alone.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

/** The site's own URL (without the #route), used as the redirect for email links. */
export function siteUrl(): string {
  return window.location.origin + window.location.pathname
}

/** Turns a Supabase/PostgREST error into a sentence a student can act on. */
export function errorMessage(error: unknown): string {
  if (!error) return 'Something went wrong.'
  const msg =
    typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error)
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Could not reach the server. Check your connection and try again.'
  if (/Invalid login credentials/i.test(msg)) return 'That email and password do not match.'
  if (/User already registered/i.test(msg)) return 'An account with this email already exists. Try signing in.'
  if (/Email not confirmed/i.test(msg)) return 'Please confirm your email first (check your inbox).'
  if (/JWT expired/i.test(msg)) return 'Your session expired. Please sign in again.'
  return msg
}
