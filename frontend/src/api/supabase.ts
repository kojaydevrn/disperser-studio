import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder_key';

// Ensure the URL is valid to prevent createClient from throwing a Fatal Error (whitescreen)
let validUrl = 'https://placeholder.supabase.co';
try {
  new URL(supabaseUrl);
  validUrl = supabaseUrl;
} catch (e) {
  console.warn('VITE_SUPABASE_URL is not a valid URL. Using placeholder.');
}

if (validUrl === 'https://placeholder.supabase.co' || supabaseAnonKey === 'placeholder_key') {
  console.warn('Supabase URL or Anon Key is missing or invalid. Please check your .env file.');
}

export const supabase = createClient(validUrl, supabaseAnonKey);
