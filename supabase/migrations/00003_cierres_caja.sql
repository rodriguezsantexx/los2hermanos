-- Tabla de cierres de caja (verificación diaria del efectivo)
-- El encargado registra cuánto efectivo contó y el sistema guarda la diferencia
-- contra el efectivo esperado (ingresos en efectivo - egresos en efectivo del día).
CREATE TABLE cierres_caja (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha DATE NOT NULL UNIQUE,
    efectivo_esperado DECIMAL(12, 2) NOT NULL,
    efectivo_contado DECIMAL(12, 2) NOT NULL,
    diferencia DECIMAL(12, 2) NOT NULL,
    usuario_id UUID REFERENCES usuarios(id),
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);