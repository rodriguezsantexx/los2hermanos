-- Guardar el link de pago de Mercado Pago en el pedido
-- para poder reenviarlo al cliente cuando sea necesario.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS mp_link TEXT;