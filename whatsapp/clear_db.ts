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

  // ORDEN DE BORRADO IMPORTANTE (Por las Foreign Keys):
  // 1. Movimientos de caja (dependen de pedidos/clientes)
  // 2. Ventas (dependen de pedidos)
  // 3. Detalle Pedidos (dependen de pedidos)
  // 4. Pagos (dependen de clientes)
  // 5. WhatsApp (mensajes -> chats)
  // 6. Pedidos (dependen de clientes)
  // 7. Clientes

  const tables = [
    'movimientos_caja',
    'ventas',
    'detalle_pedidos',
    'pagos',
    'whatsapp_mensajes',
    'whatsapp_chats',
    'movimientos_stock',
    'pedidos',
    'clientes',
    'productos'
  ];

  for (const table of tables) {
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) {
          console.error(`Error borrando ${table}:`, error.message);
      } else {
          console.log(`Tabla limpia: ${table}`);
      }
  }

  // Eliminar sesión actual de baileys para empezar de cero
  try {
    if (fs.existsSync('auth_info_baileys')) {
        fs.rmSync('auth_info_baileys', { recursive: true, force: true });
        console.log("Sesión de WhatsApp cerrada (Pedirá QR).");
    }
  } catch(e) {}

  console.log("¡Todo listo! El sistema está como nuevo.");
}

clearData();
