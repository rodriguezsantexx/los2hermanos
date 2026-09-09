-- 17. Notificaciones
-- Notificaciones en tiempo real para el panel (nuevos pedidos, procesos de choferes).
-- destinatario_rol: ADMIN | CHOFER_LA_FALDA | CHOFER_HUERTA_GRANDE
-- destinatario_id: opcional, para notificaciones a un usuario específico.
CREATE TABLE notificaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(50) NOT NULL, -- nuevo_pedido, pedido_en_reparto, pedido_entregado, gasto_registrado
    titulo VARCHAR(255) NOT NULL,
    mensaje TEXT,
    destinatario_rol VARCHAR(50),
    destinatario_id UUID REFERENCES usuarios(id),
    pedido_id UUID REFERENCES pedidos(id),
    leida BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para filtrar por rol y ordenar por fecha
CREATE INDEX idx_notificaciones_rol ON notificaciones (destinatario_rol, created_at DESC);

-- Habilitar Realtime para la tabla (necesario para que el frontend reciba las notificaciones al instante)
ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;