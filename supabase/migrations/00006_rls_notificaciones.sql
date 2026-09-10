-- 19. RLS para notificaciones
-- La tabla `notificaciones` quedó con RLS habilitado (probablemente creada desde
-- el Dashboard de Supabase, que lo activa por defecto) y sin políticas, así que
-- la app (clave anon) no puede leerlas ni marcarlas como leídas, y Realtime no
-- entrega los eventos. Estas políticas permiten el acceso de solo lectura y
-- actualización (marcar leída) para el rol anon.
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_notificaciones" ON notificaciones
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_notificaciones" ON notificaciones
  FOR UPDATE TO anon USING (true) WITH CHECK (true);