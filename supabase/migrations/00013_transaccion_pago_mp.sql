-- Migración 00013: Función RPC para procesamiento transaccional de pagos Mercado Pago
CREATE OR REPLACE FUNCTION aplicar_pago_mp_transaccional(
    p_pedido_id UUID,
    p_cliente_id UUID,
    p_monto NUMERIC,
    p_mp_payment_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido RECORD;
BEGIN
    -- 1. Intentar actualizar pago_verificado de forma atómica solo si es FALSE o NULL
    UPDATE pedidos
    SET pago_verificado = TRUE
    WHERE id = p_pedido_id AND (pago_verificado IS FALSE OR pago_verificado IS NULL)
    RETURNING * INTO v_pedido;

    -- Si ninguna fila fue afectada, ya se procesó concurrentemente o el pedido no existe
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'already_processed_or_not_found');
    END IF;

    -- 2. Registrar en tabla pagos
    IF p_cliente_id IS NOT NULL THEN
        INSERT INTO pagos (cliente_id, monto, metodo_pago)
        VALUES (p_cliente_id, ROUND(p_monto, 2), 'MercadoPago');
    END IF;

    -- 3. Registrar en movimientos_caja (solo si el pedido aún no fue marcado como 'Entregado')
    IF v_pedido.estado <> 'Entregado' THEN
        INSERT INTO movimientos_caja (tipo, monto, metodo_pago, descripcion)
        VALUES ('Ingreso', ROUND(p_monto, 2), 'MercadoPago', 'Cobro online MercadoPago #' || p_mp_payment_id || ' - Pedido #' || p_pedido_id::text);
    END IF;

    RETURN jsonb_build_object('success', true);
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;
