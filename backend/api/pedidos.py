from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response
from typing import List
from dataclasses import dataclass
from datetime import datetime, timezone
import os
import mercadopago
from database.connection import supabase
from schemas.pedido import PedidoCreate, PedidoStatusUpdate
from auth.dependencies import get_current_user, admin_required

router = APIRouter()

mp_token = os.getenv("MERCADOPAGO_ACCESS_TOKEN")
mp_sdk = mercadopago.SDK(mp_token) if mp_token else None

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
    chofer_id = None
    if pedido.tipo_pedido != "Local":
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
        "estado": "Asignado" if chofer_id else ("Pendiente" if pedido.tipo_pedido != "Local" else "Pendiente"),
        "tipo_pedido": pedido.tipo_pedido,
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
        
    mp_link = None
    if pedido.metodo_pago in ["Transferencia", "MercadoPago"] and mp_sdk:
        try:
            preference_data = {
                "items": [
                    {
                        "title": "Pedido Los 2 Hermanos",
                        "quantity": 1,
                        "unit_price": float(total_calculado)
                    }
                ],
                "external_reference": nuevo_pedido_id,
                # Usamos la URL pública configurada en .env o localhost por defecto
                "notification_url": f"{os.getenv('PUBLIC_URL', 'http://localhost:8000')}/api/pedidos/webhook/mercadopago", 
            }
            preference_response = mp_sdk.preference().create(preference_data)
            preference = preference_response["response"]
            
            if "id" in preference:
                supabase.table("pedidos").update({"mp_preference_id": preference["id"]}).eq("id", nuevo_pedido_id).execute()
                mp_link = preference.get("init_point")
        except Exception as e:
            print("Error creando preferencia MP:", str(e))
        
    return {"message": "Pedido creado", "pedido_id": nuevo_pedido_id, "chofer_asignado": chofer_id, "mp_link": mp_link}

from pydantic import BaseModel
class ProductoPedidoBot(BaseModel):
    nombre: str
    cantidad: int
    precio_unitario: float = 0 # Opcional si lo buscamos por nombre
    
class PedidoBot(BaseModel):
    productos: List[ProductoPedidoBot]
    total: float
    direccion: str
    localidad: str
    modalidad: str = "Delivery"
    metodo_pago: str
    telefono: str

@router.post("/bot")
def create_pedido_bot(pedido: PedidoBot):
    # 1. Buscar o crear cliente
    cliente_res = supabase.table("clientes").select("id").eq("telefono", pedido.telefono).execute()
    cliente_id = None
    if not cliente_res.data:
        nuevo_cli = supabase.table("clientes").insert({
            "nombre": "Cliente de WhatsApp",
            "telefono": pedido.telefono,
            "direccion": pedido.direccion
        }).execute()
        cliente_id = nuevo_cli.data[0]["id"]
    else:
        cliente_id = cliente_res.data[0]["id"]
        
    # 2. Buscar localidad y asignar chofer
    loc_res = supabase.table("localidades").select("id, nombre").ilike("nombre", f"%{pedido.localidad}%").execute()
    localidad_id = None
    chofer_id = None
    if loc_res.data:
        localidad_id = loc_res.data[0]["id"]
        nombre_localidad = loc_res.data[0]["nombre"].upper()
        
        zonas_por_chofer = {
            "LA FALDA": "CHOFER_LA_FALDA",
            "VALLE HERMOSO": "CHOFER_LA_FALDA",
            "CASA GRANDE": "CHOFER_LA_FALDA",
            "HUERTA GRANDE": "CHOFER_HUERTA_GRANDE",
            "VILLA GIARDINO": "CHOFER_HUERTA_GRANDE",
        }
        rol_buscado = zonas_por_chofer.get(nombre_localidad)
        if rol_buscado:
            rol_res = supabase.table("roles").select("id").eq("nombre", rol_buscado).execute()
            if rol_res.data:
                chofer_res = supabase.table("usuarios").select("id").eq("rol_id", rol_res.data[0]["id"]).execute()
                chofer_id = chofer_res.data[0]["id"] if chofer_res.data else None
    
    # 3. Calcular detalles buscando productos por nombre aproximado
    detalles = []
    total_calc = 0
    for p in pedido.productos:
        prod_res = supabase.table("productos").select("id, precio").ilike("nombre", f"%{p.nombre}%").execute()
        if prod_res.data:
            pid = prod_res.data[0]["id"]
            precio = prod_res.data[0]["precio"]
            sub = precio * p.cantidad
            total_calc += sub
            detalles.append({
                "producto_id": pid,
                "cantidad": p.cantidad,
                "precio_unitario": precio,
                "subtotal": sub
            })
            
    # 4. Crear pedido principal
    pedido_data = {
        "cliente_id": cliente_id,
        "localidad_id": localidad_id,
        "chofer_id": chofer_id,
        "total": total_calc or pedido.total,
        "estado": "Asignado" if chofer_id else "Pendiente",
        "tipo_pedido": pedido.modalidad,
        "metodo_pago": pedido.metodo_pago,
        "observaciones": "Creado por Bot WhatsApp"
    }
    
    nuevo_pedido_res = supabase.table("pedidos").insert(pedido_data).execute()
    nuevo_pedido_id = nuevo_pedido_res.data[0]["id"]
    
    # 5. Insertar detalles
    for det in detalles:
        det["pedido_id"] = nuevo_pedido_id
    if detalles:
        supabase.table("detalle_pedidos").insert(detalles).execute()
        
        # Descontar stock
        for det in detalles:
            prod_res = supabase.table("productos").select("stock_actual").eq("id", det["producto_id"]).execute()
            if prod_res.data:
                nuevo_stock = prod_res.data[0]["stock_actual"] - det["cantidad"]
                supabase.table("productos").update({"stock_actual": nuevo_stock}).eq("id", det["producto_id"]).execute()
                
                # Registrar movimiento
                supabase.table("movimientos_stock").insert({
                    "producto_id": det["producto_id"],
                    "cantidad": det["cantidad"],
                    "tipo": "Salida",
                    "motivo": f"Pedido WhatsApp #{nuevo_pedido_id}",
                    "pedido_id": nuevo_pedido_id
                }).execute()
        
    # 6. Mercado Pago
    mp_link = None
    if "transferencia" in pedido.metodo_pago.lower() or "mercado pago" in pedido.metodo_pago.lower():
        if mp_sdk:
            try:
                preference_data = {
                    "items": [
                        {
                            "title": "Pedido WhatsApp Los 2 Hermanos",
                            "quantity": 1,
                            "unit_price": float(total_calc or pedido.total)
                        }
                    ],
                    "external_reference": nuevo_pedido_id,
                    "notification_url": f"{os.getenv('PUBLIC_URL', 'http://localhost:8000')}/api/pedidos/webhook/mercadopago", 
                }
                preference_response = mp_sdk.preference().create(preference_data)
                preference = preference_response["response"]
                if "id" in preference:
                    supabase.table("pedidos").update({"mp_preference_id": preference["id"]}).eq("id", nuevo_pedido_id).execute()
                    mp_link = preference.get("init_point")
            except Exception as e:
                print("Error creando MP para Bot:", str(e))
                
    return {"message": "Pedido guardado", "pedido_id": nuevo_pedido_id, "mp_link": mp_link}

@router.post("/webhook/mercadopago")
async def webhook_mercadopago(request: Request):
    """
    Recibe notificaciones de Mercado Pago (Webhooks).

    Flujo seguro:
      1. Se ignora cualquier dato crudo del cuerpo y SIEMPRE se reconfirma el
         pago contra la API oficial de MP mediante el payment_id. Así evitamos
         depender de datos falsificados en el POST.
      2. Solo se procesan pagos cuyo estado sea "approved".
      3. Se protege contra procesos repetidos (dedup) marcando pago_verificado
         ANTES de insertar filas financieras, y saltándose el proceso si ya fue
         manejado.
      4. Siempre se responde rápido (JSON ok) aún frente a errores internos,
         para que MP no reintente indefinidamente.

    Recomendación de seguridad en producción:
      Configurar en el Panel de Mercado Pago -> Desarrollo -> Webhooks ->
      "Direcciones IP autorizadas" sólo con rangos públicos de Mercado Pago.
      Igualmente acá volvemos a autenticar el pago llamando a la API, por lo
      que un tercero no podría inventar un "approval".
    """
    remote_ip = request.client.host if request.client else "desconocido"
    ua = request.headers.get("user-agent", "-")

    # Leer el cuerpo tolerando ausencia/formato raro (evita excepciones).
    try:
        data = await request.json()
    except Exception:
        data = {}

    print("[MP-WEBHOOK]", datetime.now(timezone.utc).isoformat(), "| ip:", remote_ip, "| ua:", ua[:80])
    print("[MP-WEBHOOK] Payload:", data)

    event_type = data.get("type") or data.get("topic")
    payment_id = None
    if event_type == "payment":
        inner = data.get("data") or {}
        payment_id = inner.get("id")
    elif event_type == "merchant_order":
        # Podría llegar un evento de orden comercial; requerimos resolver el
        # pago asociado igualmente. Tomamos el primer payment disponible.
        orders = ((data.get("data") or {}).get("payments")) or []
        if orders:
            payment_id = orders[-1].get("id")

    if not payment_id:
        # Ping inicial de verificación u otro evento irrelevante: responder ok.
        return Response(content=b'"ok"', media_type="application/json", status_code=200)

    try:
        payment_info = mp_sdk.payment().get(str(int(payment_id))) \
            if mp_sdk else None
    except Exception as exc:
        print("[MP-WEBHOOK] Error obteniendo pago:", repr(exc))
        return Response(content=b'"ok"', media_type="application/json", status_code=200)

    if not payment_info:
        return Response(content=b'"ok"', media_type="application/json", status_code=201)

    payment = payment_info.get("response") or {}
    status_detail = payment.get("status_detail")
    print("[MP-WEBHOOK] Estado pago %s -> %s (%s)" %
          (payment_id, payment.get("status"), status_detail))

    if payment.get("status") != "approved":
        # Sigue pendiente/en proceso o rechazado: nada que hacer todavía.
        return Response(content=b'"ok"', media_type="application/json", status_code=200)

    pedido_id = payment.get("external_reference")
    if not pedido_id:
        print("[MP-WEBHOOK] Pago aprobado SIN external_reference (fuera de nuestra tienda)")
        return Response(content=b'"ok"', media_type="application/json", status_code=203)

    # ---- Proceso definitivo del pago aprobado -------------------------------
    resultado = aplicar_pago_aprobado(pedido_id, payment)
    codigo_final = 206 if resultado.ok else 502
    return Response(content=(resultado.body.encode()), media_type="application/json",
                    status_code=codigo_final)


@dataclass
class _ProcesoPago:
    ok: bool
    body: str


def aplicar_pago_aprobado(pedido_id: str, payment: dict) -> "_ProcesoPago":
    """Concreta un pago aprobado: valida el pedido, evita duplicados y
    registra el impacto financiero."""
    try:
        pedido_row = supabase.table("pedidos").select("*").eq("id", pedido_id).maybe_single().execute().data
    except Exception as exc:
        print("[MP-WEBHOOK] Error leyendo pedido:", repr(exc))
        return _ProcesoPago(True, '"procesamiento diferido"')

    if not pedido_row:
        print(f"[MP-WEBHOOK] Pedido {pedido_id} inexistente.")
        return _ProcesoPago(True, '"sin pedido vinculado"')

    # Dedup: si ya estaba verificado, damos por hecho que ya se registró.
    if pedido_row.get("pago_verificado"):
        print(f"[MP-WEBHOOK] Pedido {pedido_id} YA verificada anteriormente. Skip.")
        return _ProcesoPago(True, '"already processed"')

    monto = float(payment.get("transaction_amount") or pedido_row.get("total") or 0)
    cliente_id = pedido_row.get("cliente_id")

    # Marcar como verificado PRIMERO para reducir riesgo de carrera entre
    # múltiples notificaciones simultáneas.
    supabase.table("pedidos").update({"pago_verificado": True}) \
        .eq("id", pedido_id).execute()

    # Registro contable: tabla pagos
    if cliente_id:
        supabase.table("pagos").insert({
            "cliente_id": cliente_id,
            "monto": round(monto, 2),
            "metodo_pago": "MercadoPago",
        }).execute()

    # Registro contable: movimiento de caja (Ingreso)
    supabase.table("movimientos_caja").insert({
        "tipo": "Ingreso",
        "monto": round(monto, 2),
        "metodo_pago": "MercadoPago",
        "descripcion": f"Cobro online MercadoPago - Pedido #{pedido_id}"
    }).execute()

    print(f"[MP-WEBHOOK] ✅ Pago {payment.get('id')} aplicado al pedido {pedido_id} "
          f"(ARS {round(monto, 2)}).")
    return _ProcesoPago(True, '{"processed": true}')

@router.get("/")
def get_pedidos(current_user=Depends(get_current_user)):
    # Si es ADMIN, ve todos. Si es Chofer, ve solo los suyos.
    rol = current_user.get("roles", {}).get("nombre")
    
    query = supabase.table("pedidos").select("*, clientes(nombre, direccion, telefono), localidades(nombre), detalle_pedidos(id, cantidad, precio_unitario, subtotal, productos(nombre))")
    if rol != "ADMIN":
        query = query.eq("chofer_id", current_user["id"])
        
    res = query.order("created_at", desc=True).execute()
    return res.data

@router.post("/{pedido_id}/estado")
def actualizar_estado(pedido_id: str, request: Request, current_user=Depends(get_current_user)):
    return supabase.table("pedidos").update({"estado": "En reparto"}).eq("id", pedido_id).execute().data

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
    
    # Registrar Caja (solo si ingresa plata real, si es fiado no entra a caja)
    if update.metodo_pago.lower() != "fiado":
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
