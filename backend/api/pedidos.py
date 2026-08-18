from fastapi import APIRouter, HTTPException, Depends
from typing import List
from database.connection import supabase
from schemas.pedido import PedidoCreate, PedidoStatusUpdate
from auth.dependencies import get_current_user, admin_required

router = APIRouter()

@router.post("/")
def create_pedido(pedido: PedidoCreate, current_user=Depends(get_current_user)):
    # 1. Validar stock de todos los productos y calcular total real
    total_calculado = 0
    detalles_para_insertar = []
    
    for detalle in pedido.detalles:
        prod_res = supabase.table("productos").select("stock_actual, precio, nombre").eq("id", detalle.producto_id).execute()
        if not prod_res.data:
            raise HTTPException(status_code=404, detail=f"Producto {detalle.producto_id} no encontrado")
            
        prod = prod_res.data[0]
        if prod["stock_actual"] < detalle.cantidad:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {prod['nombre']}. Disponible: {prod['stock_actual']}")
            
        subtotal = prod["precio"] * detalle.cantidad
        total_calculado += subtotal
        
        detalles_para_insertar.append({
            "producto_id": detalle.producto_id,
            "cantidad": detalle.cantidad,
            "precio_unitario": prod["precio"],
            "subtotal": subtotal
        })

    # 2. Asignar chofer según localidad
    # Obtener el rol que corresponde a la localidad del pedido
    localidad_res = supabase.table("localidades").select("nombre").eq("id", pedido.localidad_id).execute()
    if not localidad_res.data:
        raise HTTPException(status_code=404, detail="Localidad no encontrada")
        
    nombre_localidad = localidad_res.data[0]["nombre"].upper()
    # Las zonas nuevas se reparten entre las dos camionetas existentes.
    zonas_por_chofer = {
        "LA FALDA": "CHOFER_LA_FALDA",
        "VALLE HERMOSO": "CHOFER_LA_FALDA",
        "CASA GRANDE": "CHOFER_LA_FALDA",
        "HUERTA GRANDE": "CHOFER_HUERTA_GRANDE",
        "VILLA GIARDINO": "CHOFER_HUERTA_GRANDE",
    }
    rol_buscado = zonas_por_chofer.get(nombre_localidad)
    if not rol_buscado:
        raise HTTPException(status_code=400, detail=f"No hay una zona de reparto configurada para {nombre_localidad}")
    
    rol_res = supabase.table("roles").select("id").eq("nombre", rol_buscado).execute()
    if not rol_res.data:
        raise HTTPException(status_code=409, detail=f"No existe el rol {rol_buscado} en Supabase")
    chofer_res = supabase.table("usuarios").select("id").eq("rol_id", rol_res.data[0]["id"]).execute()
    
    chofer_id = chofer_res.data[0]["id"] if chofer_res.data else None
    
    # 3. Crear pedido principal
    pedido_data = {
        "cliente_id": pedido.cliente_id,
        "localidad_id": pedido.localidad_id,
        "chofer_id": chofer_id,
        "total": total_calculado,
        "estado": "Asignado" if chofer_id else "Pendiente",
        "metodo_pago": pedido.metodo_pago,
        "observaciones": pedido.observaciones
    }
    
    nuevo_pedido_res = supabase.table("pedidos").insert(pedido_data).execute()
    nuevo_pedido_id = nuevo_pedido_res.data[0]["id"]
    
    # 4. Insertar detalles
    for det in detalles_para_insertar:
        det["pedido_id"] = nuevo_pedido_id
    supabase.table("detalle_pedidos").insert(detalles_para_insertar).execute()
    
    # 5. Descontar stock temporalmente o registrar movimiento?
    # El stock real se descuenta al ENTREGAR, o se reserva aquí.
    # Según las reglas: "Un pedido debe validar stock antes de confirmarse."
    # Para evitar negativos, reducimos el stock actual y registramos salida.
    for det in detalles_para_insertar:
        # Descontar
        prod_res = supabase.table("productos").select("stock_actual").eq("id", det["producto_id"]).execute()
        nuevo_stock = prod_res.data[0]["stock_actual"] - det["cantidad"]
        supabase.table("productos").update({"stock_actual": nuevo_stock}).eq("id", det["producto_id"]).execute()
        
        # Registrar movimiento de salida por pedido
        supabase.table("movimientos_stock").insert({
            "producto_id": det["producto_id"],
            "cantidad": det["cantidad"],
            "tipo": "Salida",
            "motivo": f"Pedido #{nuevo_pedido_id}",
            "usuario_id": current_user["id"],
            "pedido_id": nuevo_pedido_id
        }).execute()
        
    return {"message": "Pedido creado", "pedido_id": nuevo_pedido_id, "chofer_asignado": chofer_id}

@router.get("/")
def get_pedidos(current_user=Depends(get_current_user)):
    # Si es ADMIN, ve todos. Si es Chofer, ve solo los suyos.
    rol = current_user.get("roles", {}).get("nombre")
    
    query = supabase.table("pedidos").select("*, clientes(nombre, direccion, telefono), localidades(nombre), detalle_pedidos(id, cantidad, precio_unitario, subtotal, productos(nombre))")
    if rol != "ADMIN":
        query = query.eq("chofer_id", current_user["id"])
        
    res = query.execute()
    return res.data

@router.post("/{pedido_id}/entregar")
def entregar_pedido(pedido_id: str, update: PedidoStatusUpdate, current_user=Depends(get_current_user)):
    # Solo ADMIN o el Chofer asignado pueden entregar
    pedido_res = supabase.table("pedidos").select("*").eq("id", pedido_id).execute()
    if not pedido_res.data:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
        
    pedido = pedido_res.data[0]
    
    if current_user.get("roles", {}).get("nombre") != "ADMIN" and pedido["chofer_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para entregar este pedido")
        
    if pedido["estado"] == "Entregado":
        raise HTTPException(status_code=400, detail="El pedido ya fue entregado")
        
    if not update.metodo_pago:
        raise HTTPException(status_code=400, detail="Debe especificar el método de pago al entregar")

    # Marcar como entregado
    supabase.table("pedidos").update({
        "estado": "Entregado", 
        "metodo_pago": update.metodo_pago
    }).eq("id", pedido_id).execute()
    
    # Registrar Venta
    supabase.table("ventas").insert({
        "pedido_id": pedido_id,
        "total": pedido["total"],
        "metodo_pago": update.metodo_pago
    }).execute()
    
    # Registrar Caja
    supabase.table("movimientos_caja").insert({
        "tipo": "Ingreso",
        "monto": pedido["total"],
        "metodo_pago": update.metodo_pago,
        "usuario_id": current_user["id"],
        "descripcion": f"Venta Pedido #{pedido_id}"
    }).execute()
    
    # Si es fiado, cuenta corriente
    if update.metodo_pago.lower() == "fiado":
        # Sumar deuda al cliente
        cliente_res = supabase.table("clientes").select("saldo_corriente").eq("id", pedido["cliente_id"]).execute()
        nuevo_saldo = cliente_res.data[0]["saldo_corriente"] + pedido["total"]
        supabase.table("clientes").update({"saldo_corriente": nuevo_saldo}).eq("id", pedido["cliente_id"]).execute()
        
        # Movimiento CC
        supabase.table("movimientos_cuenta_corriente").insert({
            "cliente_id": pedido["cliente_id"],
            "monto": pedido["total"],
            "tipo": "Cargo",
            "pedido_id": pedido_id
        }).execute()
        
    return {"message": "Pedido entregado y registrado exitosamente"}
