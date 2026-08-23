const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function clearDb() {
  console.log('Borrando datos ficticios de chats...');
  // Borrar todos los chats (como los mensajes tienen ON DELETE CASCADE, también se borran)
  const { error } = await supabase.from('whatsapp_chats').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Elimina todo
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('¡Base de datos limpia! Lista para testing real.');
  }
}

clearDb();
