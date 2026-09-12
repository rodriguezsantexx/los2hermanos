// Test de lectura con la SERVICE ROLE KEY (bypasea RLS, solo para diagnóstico).
// ⚠️ NUNCA hardcodear esta clave en el repo. Se lee de variables de entorno.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // clave SERVICE ROLE

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno. Revisá whatsapp/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { data, error } = await supabase.from('whatsapp_chats').select('*');
  console.log("Chats:", data);
  console.log("Error:", error);
})();
