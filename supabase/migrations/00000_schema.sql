-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Roles
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(50) UNIQUE NOT NULL
);

-- 2. Localidades
CREATE TABLE localidades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) UNIQUE NOT NULL
);

-- 3. Usuarios
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    rol_id UUID REFERENCES roles(id),
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    telefono VARCHAR(50),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Categorías
CREATE TABLE categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) UNIQUE NOT NULL
);

-- 5. Productos
CREATE TABLE productos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    categoria_id UUID REFERENCES categorias(id),
    descripcion TEXT,
    precio DECIMAL(12, 2) NOT NULL DEFAULT 0,
    unidad VARCHAR(50),
    -- Regla 1: Nunca permitir stock negativo
    stock_actual INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    stock_minimo INTEGER NOT NULL DEFAULT 0,
    estado VARCHAR(50) DEFAULT 'activo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Clientes
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(50),
    direccion TEXT,
    localidad_id UUID REFERENCES localidades(id),
    saldo_corriente DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Pedidos
CREATE TABLE pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID REFERENCES clientes(id),
    localidad_id UUID REFERENCES localidades(id),
    chofer_id UUID REFERENCES usuarios(id),
    total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    estado VARCHAR(50) NOT NULL DEFAULT 'Pendiente', -- Pendiente, Confirmado, Asignado, En reparto, Entregado, Cancelado
    metodo_pago VARCHAR(50), -- Efectivo, Transferencia, Fiado
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Detalle Pedidos
CREATE TABLE detalle_pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES productos(id),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(12, 2) NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL
);

-- 9. Ventas
CREATE TABLE ventas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID REFERENCES pedidos(id),
    total DECIMAL(12, 2) NOT NULL,
    metodo_pago VARCHAR(50) NOT NULL,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Pagos
CREATE TABLE pagos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID REFERENCES clientes(id),
    monto DECIMAL(12, 2) NOT NULL CHECK (monto > 0),
    metodo_pago VARCHAR(50) NOT NULL,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Movimientos de Stock
CREATE TABLE movimientos_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producto_id UUID REFERENCES productos(id),
    cantidad INTEGER NOT NULL,
    tipo VARCHAR(50) NOT NULL, -- Entrada, Salida
    motivo VARCHAR(100) NOT NULL, -- Venta, Compra, Ajuste positivo, Merma, etc.
    usuario_id UUID REFERENCES usuarios(id),
    pedido_id UUID REFERENCES pedidos(id), -- Opcional, para relacionar el movimiento con el pedido
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Movimientos de Caja
CREATE TABLE movimientos_caja (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(50) NOT NULL, -- Ingreso, Egreso
    monto DECIMAL(12, 2) NOT NULL,
    metodo_pago VARCHAR(50) NOT NULL,
    usuario_id UUID REFERENCES usuarios(id),
    descripcion TEXT,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. Movimientos de Cuenta Corriente (Fiado)
CREATE TABLE movimientos_cuenta_corriente (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    monto DECIMAL(12, 2) NOT NULL,
    tipo VARCHAR(50) NOT NULL, -- Cargo (Aumenta deuda, ej. Fiado de un pedido), Abono (Pago parcial/total de deuda)
    pedido_id UUID REFERENCES pedidos(id),
    pago_id UUID REFERENCES pagos(id),
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. Historial de Precios
CREATE TABLE historial_precios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
    precio_anterior DECIMAL(12, 2) NOT NULL,
    precio_nuevo DECIMAL(12, 2) NOT NULL,
    usuario_id UUID REFERENCES usuarios(id),
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
