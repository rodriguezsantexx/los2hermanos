from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError

from auth.dependencies import admin_required
from database.connection import supabase
from schemas.finanzas import AbonoCuentaCreate, MovimientoCajaCreate, PagoCreate

router = APIRouter()


def money(value) -> Decimal:
    return Decimal(str(value or 0))


def json_money(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01")))


def day_window(value: date | None) -> tuple[str, str]:
    current = value or datetime.now(timezone.utc).date()
    start = datetime.combine(current, time.min, tzinfo=timezone.utc)
    return start.isoformat(), (start + timedelta(days=1)).isoformat()


@router.get("/caja/resumen")
def caja_resumen(fecha: date | None = Query(default=None), current_user=Depends(admin_required)):
    inicio, fin = day_window(fecha)
    movimientos = supabase.table("movimientos_caja").select("id, tipo, monto, metodo_pago, descripcion, fecha, usuarios(nombre)").gte("fecha", inicio).lt("fecha", fin).order("fecha", desc=True).execute().data or []
    ingresos = sum((money(item["monto"]) for item in movimientos if item["tipo"] == "Ingreso"), Decimal(0))
    egresos = sum((money(item["monto"]) for item in movimientos if item["tipo"] == "Egreso"), Decimal(0))
    return {
        "fecha": (fecha or datetime.now(timezone.utc).date()).isoformat(),
        "ingresos": json_money(ingresos),
        "egresos": json_money(egresos),
        "saldo": json_money(ingresos - egresos),
        "movimientos": movimientos,
    }


@router.post("/caja/movimientos")
def crear_movimiento_caja(movimiento: MovimientoCajaCreate, current_user=Depends(admin_required)):
    try:
        data = movimiento.model_dump(mode="json")
        data["usuario_id"] = current_user["id"]
        result = supabase.table("movimientos_caja").insert(data).execute()
        return result.data[0]
    except APIError as error:
        raise HTTPException(status_code=400, detail=error.message)


@router.get("/pagos")
def listar_pagos(limit: int = Query(default=50, ge=1, le=200), current_user=Depends(admin_required)):
    return supabase.table("pagos").select("id, cliente_id, monto, metodo_pago, fecha, clientes(nombre)").order("fecha", desc=True).limit(limit).execute().data or []


@router.post("/pagos")
def crear_pago(pago: PagoCreate, current_user=Depends(admin_required)):
    cliente = supabase.table("clientes").select("id").eq("id", pago.cliente_id).maybe_single().execute().data
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    try:
        data = pago.model_dump(mode="json")
        result = supabase.table("pagos").insert(data).execute()
        return result.data[0]
    except APIError as error:
        raise HTTPException(status_code=400, detail=error.message)


@router.get("/clientes/{cliente_id}/cuenta-corriente")
def cuenta_corriente(cliente_id: str, current_user=Depends(admin_required)):
    cliente = supabase.table("clientes").select("id, nombre, telefono, saldo_corriente").eq("id", cliente_id).maybe_single().execute().data
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    movimientos = supabase.table("movimientos_cuenta_corriente").select("id, monto, tipo, fecha, pedido_id, pago_id, pedidos(id, total), pagos(metodo_pago)").eq("cliente_id", cliente_id).order("fecha", desc=True).execute().data or []
    return {"cliente": cliente, "movimientos": movimientos}


@router.post("/clientes/{cliente_id}/abonos")
def registrar_abono(cliente_id: str, abono: AbonoCuentaCreate, current_user=Depends(admin_required)):
    cliente = supabase.table("clientes").select("id, saldo_corriente").eq("id", cliente_id).maybe_single().execute().data
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    saldo = money(cliente.get("saldo_corriente"))
    if abono.monto > saldo:
        raise HTTPException(status_code=400, detail="El abono no puede superar el saldo pendiente")
    try:
        pago = supabase.table("pagos").insert({"cliente_id": cliente_id, "monto": abono.model_dump(mode="json")["monto"], "metodo_pago": abono.metodo_pago}).execute().data[0]
        supabase.table("movimientos_cuenta_corriente").insert({"cliente_id": cliente_id, "monto": abono.model_dump(mode="json")["monto"], "tipo": "Abono", "pago_id": pago["id"]}).execute()
        nuevo_saldo = saldo - abono.monto
        supabase.table("clientes").update({"saldo_corriente": json_money(nuevo_saldo)}).eq("id", cliente_id).execute()
        supabase.table("movimientos_caja").insert({"tipo": "Ingreso", "monto": abono.model_dump(mode="json")["monto"], "metodo_pago": abono.metodo_pago, "usuario_id": current_user["id"], "descripcion": f"Abono cuenta corriente de cliente #{cliente_id}"}).execute()
        return {"message": "Abono registrado", "nuevo_saldo": json_money(nuevo_saldo), "pago": pago}
    except APIError as error:
        raise HTTPException(status_code=400, detail=error.message)


@router.get("/metricas/resumen")
def metricas_resumen(fecha: date | None = Query(default=None), current_user=Depends(admin_required)):
    inicio, fin = day_window(fecha)
    pedidos = supabase.table("pedidos").select("id, total, estado").gte("created_at", inicio).lt("created_at", fin).execute().data or []
    ventas = supabase.table("ventas").select("total, metodo_pago").gte("fecha", inicio).lt("fecha", fin).execute().data or []
    caja = supabase.table("movimientos_caja").select("tipo, monto").gte("fecha", inicio).lt("fecha", fin).execute().data or []
    clientes = supabase.table("clientes").select("saldo_corriente").execute().data or []
    stock = supabase.table("productos").select("id, nombre, stock_actual, stock_minimo").order("stock_actual").execute().data or []
    ventas_total = sum((money(item["total"]) for item in ventas), Decimal(0))
    ingresos = sum((money(item["monto"]) for item in caja if item["tipo"] == "Ingreso"), Decimal(0))
    egresos = sum((money(item["monto"]) for item in caja if item["tipo"] == "Egreso"), Decimal(0))
    estados = {estado: sum(1 for pedido in pedidos if pedido["estado"] == estado) for estado in ["Pendiente", "Confirmado", "Asignado", "En reparto", "Entregado", "Cancelado"]}
    return {
        "fecha": (fecha or datetime.now(timezone.utc).date()).isoformat(),
        "pedidos_total": len(pedidos),
        "pedidos_por_estado": estados,
        "ventas_total": json_money(ventas_total),
        "ingresos_caja": json_money(ingresos),
        "egresos_caja": json_money(egresos),
        "saldo_caja": json_money(ingresos - egresos),
        "cuenta_corriente_total": json_money(sum((money(item["saldo_corriente"]) for item in clientes), Decimal(0))),
        "stock_bajo": [item for item in stock if item["stock_actual"] <= item["stock_minimo"]],
    }
