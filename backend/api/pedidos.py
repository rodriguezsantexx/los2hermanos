from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response
from typing import List
from dataclasses import dataclass

from datetime import datetime, timezone, timedelta, time

import os
import re
import hmac
import hashlib
import requests
import mercadopago
from database.connection import supabase
from schemas.pedido import PedidoCreate, PedidoStatusUpdate
from auth.dependencies import get_current_user, admin_required
from utils.notificaciones import crear_notificacion

router = APIRouter()

mp_token = os.getenv("MERCADOPAGO_ACCESS_TOKEN")
mp_sdk = mercadopago.SDK(mp_token) if mp_token else None
mp_user_id = mp_token.split("-")[-1] if mp_token else None

def crear_qr_instore(pedido_id: str, total: float, title: str) -> str:
    if not mp_token or not mp_user_id: return None
    url = f"https://api.mercadopago.com/instore/orders/qr/seller/collectors/{mp_user_id}/pos/DELIVERY/qrs"
    data = {
        "external_reference": str(pedido_id),
        "title": title,
        "description": f"Pedido #{pedido_id}",
        "total_amount": float(total),
        "items": [
            {
                "title": title,
                "unit_price": float(total),
                "quantity": 1,
                "unit_measure": "unit",
                "total_amount": float(total)
            }
        ],
        "notification_url": f"{os.getenv('PUBLIC_URL', 'http://localhost:8000')}/api/pedidos/webhook/mercadopago"
    }
    try:
        r = requests.put(url, headers={"Authorization": f"Bearer {mp_token}"}, json=data)
        if r.status_code in (200, 201):
            return r.json().get("qr_data")
        else:
            print("Error Instore Order:", r.text)
    except Exception as e:
        print("Error request Instore Order:", e)
    return None

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
        "observaciones": pedido.observaciones,
        "direccion": pedido.direccion
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
    # Solo se genera link de pago cuando el cliente elige MercadoPago (no Transferencia)
    if pedido.metodo_pago in ("MercadoPago", "Transferencia") and mp_sdk:
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
                mp_link = preference.get("init_point")
                
                # Generar también el QR dinámico interoperable (Instore Orders)
                mp_qr_data = crear_qr_instore(nuevo_pedido_id, total_calculado, "Pedido Los 2 Hermanos")
                
                update_data = {
                    "mp_preference_id": preference["id"],
                    "mp_link": mp_link
                }
                if mp_qr_data:
                    update_data["mp_qr_data"] = mp_qr_data
                    
                supabase.table("pedidos").update(update_data).eq("id", nuevo_pedido_id).execute()
        except Exception as e:
            print("Error creando preferencia MP:", str(e))

    # Notificaciones: avisar al ADMIN y al chofer asignado
    cliente_nombre = "Cliente"
    try:
        cli_res = supabase.table("clientes").select("nombre").eq("id", pedido.cliente_id).execute()
        if cli_res.data:
            cliente_nombre = cli_res.data[0]["nombre"]
    except Exception:
        pass

    crear_notificacion(
        "nuevo_pedido",
        "🆕 Nuevo pedido",
        f"{cliente_nombre} - ${total_calculado:,.0f} ({nombre_localidad.title()})",
        "ADMIN",
        nuevo_pedido_id,
    )

    if chofer_id:
        try:
            rol_res = supabase.table("usuarios").select("roles(nombre)").eq("id", chofer_id).execute()
            rol_chofer = rol_res.data[0]["roles"]["nombre"] if rol_res.data else None
        except Exception:
            rol_chofer = None
        if rol_chofer:
            crear_notificacion(
                "nuevo_pedido",
                "🆕 Nuevo pedido asignado",
                f"{cliente_nombre} - ${total_calculado:,.0f}",
                rol_chofer,
                nuevo_pedido_id,
            )

    return {"message": "Pedido creado", "pedido_id": nuevo_pedido_id, "chofer_asignado": chofer_id, "mp_link": mp_link}

from pydantic import BaseModel
class ProductoPedidoBot(BaseModel):
    nombre: str
    cantidad: int
    precio_unitario: float = 0 # Opcional si lo buscamos por nombre
    
class PedidoBot(BaseModel):
    productos: List[ProductoPedidoBot]
    total: float = 0.0
    direccion: str = ""
    localidad: str = ""
    modalidad: str = "Delivery"
    tipo_pedido: str = None
    metodo_pago: str = "Efectivo"
    telefono: str


def check_horario_abierto(tipo_pedido: str):
    now_ar = datetime.now(timezone.utc) - timedelta(hours=3)
    if now_ar.weekday() == 6: # Domingo
        raise HTTPException(status_code=400, detail="CERRADO_DOMINGO")
        
    hora = now_ar.time()
    
    if tipo_pedido.lower() == "local":
        if not (time(9, 0) <= hora <= time(21, 0)):
            raise HTTPException(status_code=400, detail="CERRADO_DEPOSITO")
    else:
        # Reparto
        if not ((time(9, 0) <= hora <= time(14, 0)) or (time(17, 0) <= hora <= time(20, 30))):
            raise HTTPException(status_code=400, detail="CERRADO_REPARTO")


def extraer_numeros(texto: str) -> set:
    """Extrae números enteros como strings (ej. '10', '15', '45') para contrastar pesos/capacidades."""
    return set(re.findall(r'\b\d+\b', texto.lower()))


def resolver_producto(nombre_buscado: str, catalogo: list):
    """
    Busca el producto coincidente en el catálogo activo de Supabase con validación de peso/número y detección de ambigüedad.
    Retorna tupla: (producto_encontrado, lista_de_ambigüedades)
    - Si encuentra 1 coincidencia inequívoca: (producto, [])
    - Si hay ambigüedad entre 2 o más: (None, [prod1, prod2, ...])
    - Si no encuentra nada: (None, [])
    """
    buscado_clean = nombre_buscado.strip().lower()
    if not buscado_clean:
        return None, []

    numeros_buscados = extraer_numeros(buscado_clean)

    # Filtrar candidatos cuyo número/peso NO entre en conflicto con el buscado (ej: 10kg no es 15kg)
    candidatos_validos = []
    for prod in catalogo:
        nombre_prod = prod["nombre"].strip().lower()
        numeros_prod = extraer_numeros(nombre_prod)
        if numeros_buscados and numeros_prod and not (numeros_buscados & numeros_prod):
            continue
        candidatos_validos.append(prod)

    # 1. Coincidencia exacta
    for prod in candidatos_validos:
        if prod["nombre"].strip().lower() == buscado_clean:
            return prod, []

    # 2. Coincidencia por subcadena
    coincidencias_sub = []
    for prod in candidatos_validos:
        nombre_prod = prod["nombre"].strip().lower()
        if nombre_prod in buscado_clean or buscado_clean in nombre_prod:
            coincidencias_sub.append(prod)

    if len(coincidencias_sub) == 1:
        return coincidencias_sub[0], []
    elif len(coincidencias_sub) > 1:
        # Si el usuario especificó una marca en la búsqueda (ej: "ypf", "shell")
        marcas_en_busqueda = [m for m in ["ypf", "shell", "extragas", "total"] if m in buscado_clean]
        if marcas_en_busqueda:
            filtrados_por_marca = [c for c in coincidencias_sub if any(m in c["nombre"].lower() or m in (c.get("marca") or "").lower() for m in marcas_en_busqueda)]
            if len(filtrados_por_marca) == 1:
                return filtrados_por_marca[0], []
        # Si persiste la ambigüedad, no elegir al azar: devolver candidatos para preguntar
        return None, coincidencias_sub

    # 3. Coincidencia por tokens clave
    stopwords = {"de", "y", "en", "el", "la", "los", "las", "un", "una", "kg", "kilos", "bolsa"}
    tokens_buscados = {t for t in buscado_clean.replace("-", " ").replace("_", " ").split() if t not in stopwords and len(t) > 1}

    scores = []
    for prod in candidatos_validos:
        tokens_prod = {t for t in prod["nombre"].lower().replace("-", " ").replace("_", " ").split() if t not in stopwords and len(t) > 1}
        score = len(tokens_buscados.intersection(tokens_prod))
        if score >= 2:
            scores.append((score, prod))

    if scores:
        scores.sort(key=lambda x: x[0], reverse=True)
        max_score = scores[0][0]
        mejores = [prod for sc, prod in scores if sc == max_score]
        if len(mejores) == 1:
            return mejores[0], []
        else:
            return None, mejores

    return None, []


@router.post("/bot")
def create_pedido_bot(pedido: PedidoBot):
    tipo_op = pedido.tipo_pedido or pedido.modalidad or "Delivery"
    check_horario_abierto(tipo_op)

    # 0. Validar que vengan productos
    if not pedido.productos:
        raise HTTPException(status_code=400, detail="SIN_PRODUCTOS")

    # Cargar catálogo activo de productos
    prods_db = supabase.table("productos") \
        .select("id, nombre, marca, precio, precio_retiro, stock_actual, estado") \
        .eq("estado", "activo") \
        .execute().data or []

    es_retiro = tipo_op.strip().lower() in ["local", "retiro"]

    detalles = []
    total_calc = 0.0

    for p in pedido.productos:
        if p.cantidad <= 0:
            raise HTTPException(status_code=400, detail=f"CANTIDAD_INVALIDA:{p.nombre}")

        prod, opciones = resolver_producto(p.nombre, prods_db)
        if not prod:
            if opciones:
                nombres_opc = [o["nombre"] for o in opciones[:3]]
                print(f"[BOT-PEDIDO] ⚠️ Ambigüedad de producto para '{p.nombre}': {nombres_opc}")
                raise HTTPException(status_code=400, detail=f"AMBIGUEDAD_PRODUCTO:{p.nombre}:{','.join(nombres_opc)}")
            print(f"[BOT-PEDIDO] ❌ Producto no identificado en catálogo: '{p.nombre}'")
            raise HTTPException(status_code=400, detail=f"PRODUCTO_NO_ENCONTRADO:{p.nombre}")

        # Validar stock disponible preliminarmente
        stock_actual = prod.get("stock_actual", 0)
        if stock_actual < p.cantidad:
            print(f"[BOT-PEDIDO] ⚠️ Stock insuficiente para '{prod['nombre']}' (Disp: {stock_actual}, Pedido: {p.cantidad})")
            raise HTTPException(status_code=400, detail=f"STOCK_INSUFICIENTE:{prod['nombre']}:{stock_actual}")

        # Precio unitario según modalidad (retiro o delivery)
        if es_retiro and prod.get("precio_retiro") and float(prod["precio_retiro"]) > 0:
            precio_unitario = float(prod["precio_retiro"])
        else:
            precio_unitario = float(prod["precio"])

        sub = round(precio_unitario * p.cantidad, 2)
        total_calc += sub

        detalles.append({
            "producto_id": prod["id"],
            "cantidad": p.cantidad,
            "precio_unitario": precio_unitario,
            "subtotal": sub
        })

    if not detalles:
        raise HTTPException(status_code=400, detail="SIN_PRODUCTOS")

    total_calc = round(total_calc, 2)

    # 1. Buscar o crear cliente (normalizando el teléfono sin @s.whatsapp.net)
    tel_limpio = re.sub(r'[^0-9]', '', (pedido.telefono or '').split('@')[0]) or pedido.telefono
    cliente_res = supabase.table("clientes").select("id").in_("telefono", [tel_limpio, pedido.telefono]).execute()
    cliente_id = None
    if not cliente_res.data:
        nuevo_cli = supabase.table("clientes").insert({
            "nombre": "Cliente de WhatsApp",
            "telefono": tel_limpio,
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
    
    # 2b. Actualizar dirección y localidad del cliente
    if pedido.direccion:
        try:
            supabase.table("clientes").update({
                "direccion": pedido.direccion,
                "localidad_id": localidad_id
            }).eq("id", cliente_id).execute()
        except Exception as e:
            print("Error actualizando dirección del cliente:", str(e))
    
    # 3. Crear pedido principal con total fidedigno
    pedido_data = {
        "cliente_id": cliente_id,
        "localidad_id": localidad_id,
        "chofer_id": chofer_id,
        "total": total_calc,
        "estado": "Asignado" if chofer_id else "Pendiente",
        "tipo_pedido": tipo_op,
        "metodo_pago": pedido.metodo_pago,
        "observaciones": "Creado por Bot WhatsApp",
        "direccion": pedido.direccion
    }
    
    nuevo_pedido_res = supabase.table("pedidos").insert(pedido_data).execute()
    nuevo_pedido_id = nuevo_pedido_res.data[0]["id"]
    
    # 4. Insertar detalles
    for det in detalles:
        det["pedido_id"] = nuevo_pedido_id
    supabase.table("detalle_pedidos").insert(detalles).execute()
        
    # 5. Descontar stock de forma atómica y registrar movimiento
    for det in detalles:
        descontado = False
        try:
            # Descuento atómico vía RPC en Postgres (WHERE stock_actual >= cantidad)
            rpc_res = supabase.rpc("descontar_stock_atomico", {
                "p_producto_id": det["producto_id"],
                "p_cantidad": det["cantidad"]
            }).execute()
            descontado = bool(rpc_res.data)
        except Exception as e:
            # Fallback seguro condicional si la RPC aún no fue migrada
            prod_row = supabase.table("productos").select("stock_actual").eq("id", det["producto_id"]).single().execute().data
            if prod_row and prod_row.get("stock_actual", 0) >= det["cantidad"]:
                nuevo_stock = prod_row["stock_actual"] - det["cantidad"]
                supabase.table("productos").update({"stock_actual": nuevo_stock}).eq("id", det["producto_id"]).execute()
                descontado = True

        if not descontado:
            # Si entre la validación y el descuento se agotó el stock por concurrencia, revertir pedido
            supabase.table("pedidos").delete().eq("id", nuevo_pedido_id).execute()
            raise HTTPException(status_code=400, detail=f"STOCK_INSUFICIENTE:{det.get('producto_id', '')}:0")

        supabase.table("movimientos_stock").insert({
            "producto_id": det["producto_id"],
            "cantidad": det["cantidad"],
            "tipo": "Salida",
            "motivo": f"Pedido WhatsApp #{nuevo_pedido_id}",
            "pedido_id": nuevo_pedido_id
        }).execute()
        
    # 6. Mercado Pago: se genera la preferencia para Transferencia y MercadoPago
    # (el chofer muestra el QR al entregar), pero el link SOLO se devuelve al
    # cliente cuando eligió MercadoPago (en Transferencia no se le envía link).
    mp_link = None
    if ("transferencia" in pedido.metodo_pago.lower() or "mercado pago" in pedido.metodo_pago.lower()) and mp_sdk:
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
                link = preference.get("init_point")
                
                # Generar también el QR dinámico interoperable
                mp_qr_data = crear_qr_instore(nuevo_pedido_id, float(total_calc or pedido.total), "Pedido WhatsApp Los 2 Hermanos")
                
                update_data = {
                    "mp_preference_id": preference["id"],
                    "mp_link": link
                }
                if mp_qr_data:
                    update_data["mp_qr_data"] = mp_qr_data
                    
                supabase.table("pedidos").update(update_data).eq("id", nuevo_pedido_id).execute()
                if "mercado pago" in pedido.metodo_pago.lower():
                    mp_link = link
        except Exception as e:
            print("Error creando MP para Bot:", str(e))

    # Notificaciones: avisar al ADMIN y al chofer asignado
    cliente_nombre = "Cliente de WhatsApp"
    try:
        cli_res = supabase.table("clientes").select("nombre").eq("id", cliente_id).execute()
        if cli_res.data:
            cliente_nombre = cli_res.data[0]["nombre"]
    except Exception:
        pass

    crear_notificacion(
        "nuevo_pedido",
        "🆕 Nuevo pedido (WhatsApp)",
        f"{cliente_nombre} - ${total_calc or pedido.total:,.0f}",
        "ADMIN",
        nuevo_pedido_id,
    )

    if chofer_id:
        try:
            rol_res = supabase.table("usuarios").select("roles(nombre)").eq("id", chofer_id).execute()
            rol_chofer = rol_res.data[0]["roles"]["nombre"] if rol_res.data else None
        except Exception:
            rol_chofer = None
        if rol_chofer:
            crear_notificacion(
                "nuevo_pedido",
                "🆕 Nuevo pedido asignado",
                f"{cliente_nombre} - ${total_calc or pedido.total:,.0f}",
                rol_chofer,
                nuevo_pedido_id,
            )

    return {"message": "Pedido guardado", "pedido_id": nuevo_pedido_id, "mp_link": mp_link}

def verificar_firma_mercadopago(request: Request, data_id: str) -> bool:
    """Valida criptográficamente la cabecera x-signature de Mercado Pago con HMAC-SHA256."""
    secret = os.getenv("MP_WEBHOOK_SECRET")
    is_prod = os.getenv("ENV", "development").lower() in ("production", "prod") or bool(os.getenv("RAILWAY_ENVIRONMENT"))

    if not secret:
        if is_prod:
            print("[MP-WEBHOOK] ❌ CRÍTICO: MP_WEBHOOK_SECRET no configurado en producción. Rechazando webhook (fail-closed).")
            return False
        # En desarrollo local sin secreto, se avisa en logs y se permite probar
        print("[MP-WEBHOOK] ⚠️ Modo desarrollo: MP_WEBHOOK_SECRET no configurado. Bypass temporal.")
        return True

    x_signature = request.headers.get("x-signature")
    x_request_id = request.headers.get("x-request-id")

    if not x_signature or not x_request_id:
        print("[MP-WEBHOOK] ⚠️ Falta x-signature o x-request-id en headers")
        return False

    try:
        # Parsear ts y v1 del header (ej: "ts=1700000000,v1=abcdef...")
        parts = {}
        for part in x_signature.split(","):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                parts[k] = v

        ts = parts.get("ts")
        v1 = parts.get("v1")

        if not ts or not v1:
            print("[MP-WEBHOOK] ⚠️ Formato inválido de x-signature")
            return False

        # Si data_id viene de query param request.query_params.get("data.id"), o el payment_id
        data_id_val = request.query_params.get("data.id") or data_id or ""

        # Plantilla oficial de validación de Mercado Pago: id:[data.id];request-id:[x-request-id];ts:[ts];
        manifest = f"id:{data_id_val};request-id:{x_request_id};ts:{ts};"
        computed_hash = hmac.new(
            secret.encode("utf-8"),
            manifest.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        es_valido = hmac.compare_digest(computed_hash, v1)
        if not es_valido:
            print("[MP-WEBHOOK] ❌ Firma inválida de Mercado Pago (rechazada)")
        return es_valido
    except Exception as e:
        print(f"[MP-WEBHOOK] Error validando firma MP: {e}")
        return False


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

    # Validar firma criptográfica x-signature si MP_WEBHOOK_SECRET está configurado
    if not verificar_firma_mercadopago(request, str(payment_id)):
        return Response(content=b'"invalid signature"', media_type="application/json", status_code=401)

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
    """Concreta un pago aprobado de forma atómica y transaccional."""
    try:
        pedido_row = supabase.table("pedidos").select("*").eq("id", pedido_id).maybe_single().execute().data
    except Exception as exc:
        print("[MP-WEBHOOK] Error leyendo pedido:", repr(exc))
        return _ProcesoPago(True, '"procesamiento diferido"')

    if not pedido_row:
        print(f"[MP-WEBHOOK] Pedido {pedido_id} inexistente.")
        return _ProcesoPago(True, '"sin pedido vinculado"')

    monto = float(payment.get("transaction_amount") or pedido_row.get("total") or 0)
    cliente_id = pedido_row.get("cliente_id")
    mp_payment_id = str(payment.get("id", ""))

    # 1. Intentar procesamiento transaccional en una sola función RPC en Postgres
    try:
        rpc_res = supabase.rpc("aplicar_pago_mp_transaccional", {
            "p_pedido_id": pedido_id,
            "p_cliente_id": cliente_id,
            "p_monto": round(monto, 2),
            "p_mp_payment_id": mp_payment_id
        }).execute()

        if rpc_res.data:
            if rpc_res.data.get("success"):
                print(f"[MP-WEBHOOK] ✅ Pago {mp_payment_id} aplicado transaccionalmente (RPC) al pedido {pedido_id} (ARS {round(monto, 2)}).")
                return _ProcesoPago(True, '{"processed": true}')
            elif rpc_res.data.get("reason") == "already_processed_or_not_found":
                print(f"[MP-WEBHOOK] Pedido {pedido_id} YA verificado concurrentemente (RPC). Skip idempotente.")
                return _ProcesoPago(True, '"already processed"')
    except Exception as rpc_err:
        print("[MP-WEBHOOK] RPC falló o no existe, usando fallback seguro:", repr(rpc_err))

    # 2. Fallback seguro en Python:
    # Dedup: si ya estaba verificado en la lectura previa, skip.
    if pedido_row.get("pago_verificado"):
        print(f"[MP-WEBHOOK] Pedido {pedido_id} YA verificado anteriormente. Skip.")
        return _ProcesoPago(True, '"already processed"')

    # Actualizar pago_verificado SOLO SI actualmente es False (candado a nivel Postgres)
    try:
        update_res = supabase.table("pedidos") \
            .update({"pago_verificado": True}) \
            .eq("id", pedido_id) \
            .eq("pago_verificado", False) \
            .execute()

        if not update_res.data:
            print(f"[MP-WEBHOOK] Pedido {pedido_id} YA verificado concurrentemente. Skip.")
            return _ProcesoPago(True, '"already processed"')
    except Exception as exc:
        print("[MP-WEBHOOK] Error en update atómico:", repr(exc))
        return _ProcesoPago(True, '"error update"')

    # Doble candado en movimientos_caja para este payment_id específico:
    if mp_payment_id:
        mov_existente = supabase.table("movimientos_caja") \
            .select("id") \
            .ilike("descripcion", f"%#{mp_payment_id}%") \
            .execute()
        if mov_existente.data:
            print(f"[MP-WEBHOOK] Movimiento de caja ya existe para payment #{mp_payment_id}. Skip.")
            return _ProcesoPago(True, '"already processed"')

    # Registro contable: tabla pagos
    if cliente_id:
        supabase.table("pagos").insert({
            "cliente_id": cliente_id,
            "monto": round(monto, 2),
            "metodo_pago": "MercadoPago",
        }).execute()

    # Registro contable: movimiento de caja (Ingreso)
    # Si el pedido ya fue ENTREGADO, el ingreso ya se registró en entregar_pedido — no duplicar.
    if pedido_row.get("estado") != "Entregado":
        supabase.table("movimientos_caja").insert({
            "tipo": "Ingreso",
            "monto": round(monto, 2),
            "metodo_pago": "MercadoPago",
            "descripcion": f"Cobro online MercadoPago #{mp_payment_id} - Pedido #{pedido_id}"
        }).execute()

    print(f"[MP-WEBHOOK] ✅ Pago {mp_payment_id} aplicado al pedido {pedido_id} "
          f"(ARS {round(monto, 2)}).")
    return _ProcesoPago(True, '{"processed": true}')

@router.get("/")
def get_pedidos(current_user=Depends(get_current_user)):
    # Si es ADMIN, ve todos. Si es Chofer, ve solo los suyos.
    rol = current_user.get("roles", {}).get("nombre")
    
    query = supabase.table("pedidos").select("*, clientes(nombre, direccion, telefono), localidades(nombre), detalle_pedidos(id, cantidad, precio_unitario, subtotal, productos(nombre, marca))")
    if rol != "ADMIN":
        query = query.eq("chofer_id", current_user["id"])
        
    res = query.order("created_at", desc=True).execute()
    return res.data

@router.get("/{pedido_id}/link-pago")
def get_link_pago(pedido_id: str, current_user=Depends(get_current_user)):
    """Devuelve el link de pago de Mercado Pago de un pedido.
    Si no está guardado, lo recupera desde Mercado Pago usando la preferencia."""
    pedido_res = supabase.table("pedidos").select("mp_link, mp_preference_id, chofer_id").eq("id", pedido_id).execute()
    if not pedido_res.data:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    pedido = pedido_res.data[0]
    if current_user.get("roles", {}).get("nombre") != "ADMIN" and pedido["chofer_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver este pedido")

    if pedido.get("mp_link"):
        return {"mp_link": pedido["mp_link"]}

    if pedido.get("mp_preference_id") and mp_sdk:
        try:
            pref = mp_sdk.preference().get(pedido["mp_preference_id"])
            link = (pref.get("response") or {}).get("init_point")
            if link:
                supabase.table("pedidos").update({"mp_link": link}).eq("id", pedido_id).execute()
                return {"mp_link": link}
        except Exception as e:
            print("Error recuperando preferencia MP:", str(e))

    raise HTTPException(status_code=404, detail="Este pedido no tiene link de pago")

@router.post("/{pedido_id}/estado")
def actualizar_estado(pedido_id: str, request: Request, current_user=Depends(get_current_user)):
    # Solo ADMIN o el Chofer asignado pueden marcar el pedido en reparto
    pedido_res = supabase.table("pedidos").select("*").eq("id", pedido_id).execute()
    if not pedido_res.data:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    pedido = pedido_res.data[0]
    if current_user.get("roles", {}).get("nombre") != "ADMIN" and pedido["chofer_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para modificar este pedido")

    estado_anterior = pedido["estado"]
    res = supabase.table("pedidos").update({"estado": "En reparto"}).eq("id", pedido_id).execute().data

    # Notificar al ADMIN que el chofer comenzó el reparto
    try:
        pedido = supabase.table("pedidos").select("*, clientes(nombre, telefono)").eq("id", pedido_id).maybe_single().execute().data
        if pedido:
            chofer_nombre = current_user.get("nombre", "El chofer")
            cliente_nombre = (pedido.get("clientes") or {}).get("nombre", "cliente")
            crear_notificacion(
                "pedido_en_reparto",
                "🚚 Pedido en reparto",
                f"{chofer_nombre} comenzó el reparto de {cliente_nombre}",
                "ADMIN",
                pedido_id,
            )

            # Avisar al cliente por WhatsApp que el chofer está en camino
            # (solo la primera vez que el pedido pasa a En reparto)
            telefono = (pedido.get("clientes") or {}).get("telefono")
            bot_url = os.getenv("BOT_URL")
            if telefono and bot_url and estado_anterior != "En reparto":
                try:
                    telefono_jid = telefono if "@" in telefono else f"{telefono}@s.whatsapp.net"
                    requests.post(
                        f"{bot_url}/api/send-message",
                        json={
                            "telefono": telefono_jid,
                            "mensaje": f"🚚 ¡Hola {cliente_nombre}! Tu pedido está en camino. El chofer ya salió con tu pedido, estate atento/a que llega en breve. ¡Gracias por elegir Los 2 Hermanos!",
                        },
                        timeout=10,
                    )
                except Exception as exc:
                    print("Error avisando al cliente por WhatsApp:", repr(exc))
    except Exception as e:
        print("Error notificando en reparto:", str(e))

    return res


def normalizar_metodo_pago(valor: str | None) -> str:
    """Normaliza el método de pago a valores canónicos (Efectivo/Transferencia/MercadoPago).
    Si viene vacío o 'A confirmar', asume Efectivo (el pago se cobra al entregar)."""
    if not valor:
        return "Efectivo"
    v = valor.strip().lower()
    if "efectivo" in v:
        return "Efectivo"
    if "mercado" in v:
        return "MercadoPago"
    if "transferencia" in v or "digital" in v:
        return "Transferencia"
    if "confirmar" in v or "pendiente" in v:
        return "Efectivo"
    return valor.strip()


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

    metodo_pago = normalizar_metodo_pago(update.metodo_pago)

    # Marcar como entregado
    supabase.table("pedidos").update({
        "estado": "Entregado", 
        "metodo_pago": metodo_pago
    }).eq("id", pedido_id).execute()
    
    # Registrar Venta
    supabase.table("ventas").insert({
        "pedido_id": pedido_id,
        "total": pedido["total"],
        "metodo_pago": metodo_pago
    }).execute()
    
    # Registrar Caja (ingreso de plata real).
    # Si el pago fue por MercadoPago y el webhook ya lo registró (pago_verificado),
    # el ingreso ya está contabilizado en movimientos_caja — no duplicar.
    if not (metodo_pago == "MercadoPago" and pedido.get("pago_verificado")):
        supabase.table("movimientos_caja").insert({
            "tipo": "Ingreso",
            "monto": pedido["total"],
            "metodo_pago": metodo_pago,
            "usuario_id": current_user["id"],
            "descripcion": f"Venta Pedido #{pedido_id}"
        }).execute()

    # Notificar al ADMIN que el chofer entregó el pedido
    try:
        chofer_nombre = current_user.get("nombre", "El chofer")
        cliente_nombre = "cliente"
        cli_res = supabase.table("clientes").select("nombre").eq("id", pedido["cliente_id"]).execute()
        if cli_res.data:
            cliente_nombre = cli_res.data[0]["nombre"]
        crear_notificacion(
            "pedido_entregado",
            "✅ Pedido entregado",
            f"{chofer_nombre} entregó el pedido de {cliente_nombre} - ${pedido['total']:,.0f}",
            "ADMIN",
            pedido_id,
        )
    except Exception as e:
        print("Error notificando entrega:", str(e))

    return {"message": "Pedido entregado y registrado exitosamente"}
