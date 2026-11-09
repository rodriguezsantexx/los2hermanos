-- Migración 00014: Función RPC para descuento atómico de stock contra condiciones de carrera
CREATE OR REPLACE FUNCTION descontar_stock_atomico(
    p_producto_id UUID,
    p_cantidad INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_filas_afectadas INT;
BEGIN
    -- Descontar únicamente si el stock actual es mayor o igual a la cantidad requerida
    UPDATE productos
    SET stock_actual = stock_actual - p_cantidad
    WHERE id = p_producto_id AND stock_actual >= p_cantidad;

    GET DIAGNOSTICS v_filas_afectadas = ROW_COUNT;
    RETURN v_filas_afectadas > 0;
END;
$$;
