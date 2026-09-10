-- 00008: Habilitar RLS en TODAS las tablas públicas + políticas anon mínimas
--
-- Contexto de acceso:
--   - Backend (FastAPI) y bot de WhatsApp usan service_role → BYPASAN RLS.
--   - La web usa la anon key SOLO para:
--       * whatsapp_chats:    SELECT + UPDATE (página chat, clientes, NotificationContext)
--       * whatsapp_mensajes: SELECT (página chat, clientes)
--       * clientes:          SELECT (buscar id por teléfono al crear pedido)
--       * notificaciones:    SELECT + UPDATE (ya tiene políticas en 00006)
--
-- Todo lo demás (productos, pedidos, ventas, pagos, usuarios, etc.) lo accede
-- únicamente el backend/bot con service_role → NO se agregan políticas anon,
-- quedando protegidas de la anon key pública.

-- ── 1. Habilitar RLS en todas las tablas que aún no lo tienen ──────────────
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE localidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;

-- ── 2. Políticas anon mínimas (solo lo que la web necesita en vivo) ─────────

-- whatsapp_chats: la web lee los chats y cambia modo_ia (humano/IA)
DROP POLICY IF EXISTS "anon_select_whatsapp_chats" ON whatsapp_chats;
CREATE POLICY "anon_select_whatsapp_chats" ON whatsapp_chats
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_update_whatsapp_chats" ON whatsapp_chats;
CREATE POLICY "anon_update_whatsapp_chats" ON whatsapp_chats
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- whatsapp_mensajes: la web lee los mensajes del chat
DROP POLICY IF EXISTS "anon_select_whatsapp_mensajes" ON whatsapp_mensajes;
CREATE POLICY "anon_select_whatsapp_mensajes" ON whatsapp_mensajes
  FOR SELECT TO anon USING (true);

-- clientes: la web busca el id del cliente por teléfono al crear un pedido
DROP POLICY IF EXISTS "anon_select_clientes" ON clientes;
CREATE POLICY "anon_select_clientes" ON clientes
  FOR SELECT TO anon USING (true);