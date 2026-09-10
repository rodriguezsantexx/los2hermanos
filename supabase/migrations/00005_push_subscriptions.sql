-- 18. Push Subscriptions (Web Push)
-- Guarda las suscripciones push de cada usuario para enviar notificaciones
-- nativas al celular (bandeja de entrada) aunque la app esté cerrada.
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para buscar suscripciones por usuario
CREATE INDEX idx_push_subscriptions_usuario ON push_subscriptions (usuario_id);