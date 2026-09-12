// Test de lectura con la clave ANON (la que usa la web pública).
// Las claves se leen de variables de entorno (ver whatsapp/.env), NO se hardcodean.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // clave ANON

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan SUPABASE_URL o SUPABASE_KEY en el entorno. Revisá whatsapp/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { data, error } = await supabase.from('whatsapp_chats').select('*').order('updated_at', { ascending: false });
  console.log("Anon Chats:", data);
  console.log("Anon Error:", error);
})();
