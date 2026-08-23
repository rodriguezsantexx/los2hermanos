import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltan variables de entorno de Supabase");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearData() {
  console.log("Limpiando datos de prueba...");

  // 1. Borrar mensajes de WhatsApp
  const { error: msgErr } = await supabase.from('whatsapp_mensajes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (msgErr) console.error("Error borrando mensajes:", msgErr.message);
  else console.log("Mensajes borrados.");

  // 2. Borrar chats de WhatsApp
  const { error: chatErr } = await supabase.from('whatsapp_chats').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (chatErr) console.error("Error borrando chats:", chatErr.message);
  else console.log("Chats borrados.");

  // 3. Borrar detalles de pedidos
  const { error: detErr } = await supabase.from('detalles_pedido').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (detErr) console.error("Error borrando detalles de pedido:", detErr.message);
  else console.log("Detalles de pedido borrados.");

  // 4. Borrar pedidos
  const { error: pedErr } = await supabase.from('pedidos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (pedErr) console.error("Error borrando pedidos:", pedErr.message);
  else console.log("Pedidos borrados.");

  // 5. Borrar clientes de prueba (Opcional, pero recomendado para mostrar limpio)
  // No borramos la cuenta de gastos/caja_diaria, solo clientes de ventas.
  const { error: cliErr } = await supabase.from('clientes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (cliErr) console.error("Error borrando clientes:", cliErr.message);
  else console.log("Clientes borrados.");

  // 6. Eliminar sesión actual de baileys para empezar de cero
  try {
    if (fs.existsSync('auth_info_baileys')) {
        fs.rmSync('auth_info_baileys', { recursive: true, force: true });
        console.log("Sesión de WhatsApp cerrada (Pedirá QR).");
    }
  } catch(e) {}

  console.log("¡Todo listo! El sistema está como nuevo.");
}

clearData();
