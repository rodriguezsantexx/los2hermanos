-- 15. WhatsApp Chats
CREATE TABLE whatsapp_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telefono VARCHAR(50) UNIQUE NOT NULL,
    nombre_contacto VARCHAR(255),
    modo_ia BOOLEAN DEFAULT true, -- true = AI responde, false = Humano responde
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. WhatsApp Mensajes
CREATE TABLE whatsapp_mensajes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID REFERENCES whatsapp_chats(id) ON DELETE CASCADE,
    es_bot BOOLEAN NOT NULL DEFAULT false, -- true = enviado por nosotros (bot/humano), false = enviado por el cliente
    mensaje TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
