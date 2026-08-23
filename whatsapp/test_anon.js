const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://pmmibkdizmuvelresumn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtbWlia2Rpem11dmVscmVzdW1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MzIwMjksImV4cCI6MjEwMjUwODAyOX0.0JsYiH4Y2JsthbRerN-K-SsP_u0LUmWOWIMjpVmQ-fo');
(async () => {
  const { data, error } = await supabase.from('whatsapp_chats').select('*').order('updated_at', { ascending: false });
  console.log("Anon Chats:", data);
  console.log("Anon Error:", error);
})();
