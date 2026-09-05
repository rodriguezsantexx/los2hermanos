-- Eliminar funcionalidad de Fiado / Cuenta Corriente (decisión del dueño, sep 2026)
-- El cliente no quiere cuentas corrientes ni fiados.

-- 1. Eliminar movimientos de cuenta corriente (fiado)
DROP TABLE IF EXISTS movimientos_cuenta_corriente;

-- 2. Eliminar columna saldo_corriente de clientes
ALTER TABLE clientes DROP COLUMN IF EXISTS saldo_corriente;