// Provider-independent session access.
//
// src/auth/** is one of the two layers allowed to import the Supabase client
// (the other is src/data/**). AuthProvider exposes the session through React
// context, but some components must work standalone on pages with no
// <AuthProvider> — currently AccountMenu. These thin wrappers give them the
// same session surface without importing the client directly.

import { supabase } from "../lib/supabase.js";

export function getSession() {
  return supabase.auth.getSession();
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

export function signOut() {
  return supabase.auth.signOut();
}
