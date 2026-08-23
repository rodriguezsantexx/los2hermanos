const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://pmmibkdizmuvelresumn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtbWlia2Rpem11dmVscmVzdW1uIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjkzMjAyOSwiZXhwIjoyMTAyNTA4MDI5fQ.k5zuIYnqedJQFsbPgVD8ZjYFDnCcS4caa72266dt1gk');
(async () => {
  const { data, error } = await supabase.from('whatsapp_chats').select('*');
  console.log("Chats:", data);
  console.log("Error:", error);
})();
