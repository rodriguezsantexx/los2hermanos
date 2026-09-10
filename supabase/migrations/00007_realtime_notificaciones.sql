-- 20. Asegurar Realtime para notificaciones (idempotente)
-- Si la tabla `notificaciones` se creó desde el Dashboard (no por migración),
-- puede que no esté en la publicación supabase_realtime y Realtime no entregue
-- los eventos al frontend. Este bloque la agrega solo si falta.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notificaciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;
  END IF;
END $$;