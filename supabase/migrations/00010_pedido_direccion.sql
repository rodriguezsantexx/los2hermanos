-- Guardar la dirección de entrega en cada pedido.
-- Cada pedido puede tener una dirección distinta (el cliente puede pedir a
-- otra casa), así la app muestra la dirección correcta de cada pedido y no
-- la última guardada en el cliente.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS direccion TEXT;