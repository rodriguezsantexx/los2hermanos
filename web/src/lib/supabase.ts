import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pmmibkdizmuvelresumn.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtbWlia2Rpem11dmVscmVzdW1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MzIwMjksImV4cCI6MjEwMjUwODAyOX0.0JsYiH4Y2JsthbRerN-K-SsP_u0LUmWOWIMjpVmQ-fo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
