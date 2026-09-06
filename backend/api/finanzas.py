from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError

from auth.dependencies import admin_required, get_current_user
from database.connection import supabase
from schemas.finanzas import CierreCajaCreate, GastoChoferCreate, MovimientoCajaCreate, PagoCreate

router = APIRouter()


def money(value) -> Decimal:
    return Decimal(str(value or 0))


def json_money(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01")))


# Zona horaria del negocio (Argentina). El "día" va de 00:00 a 00:00 hora local.
ZONA_ARG = ZoneInfo("America/Argentina/Buenos_Aires")


def hoy_arg() -> date:
    return datetime.now(ZONA_ARG).date()


def day_window(value: date | None) -> tuple[str, str]:
    current = value or hoy_arg()
    start = datetime.combine(current, time.min, tzinfo=ZONA_ARG)
    return start.isoformat(), (start + timedelta(days=1)).isoformat()


def month_window(mes_str: str | None) -> tuple[str, str]:
    # mes_str format: "YYYY-MM"
    current = hoy_arg()
    if mes_str:
        try:
            year, month = map(int, mes_str.split("-"))
            current = date(year, month, 1)
        except ValueError:
            pass
    else:
        current = date(current.year, current.month, 1)
        
    start = datetime.combine(current, time.min, tzinfo=ZONA_ARG)
    
    # Calculate next month
    if current.month == 12:
        next_month = date(current.year + 1, 1, 1)
    else:
        next_month = date(current.year, current.month + 1, 1)
        
    end = datetime.combine(next_month, time.min, tzinfo=ZONA_ARG)
    return start.isoformat(), end.isoformat()


@router.get("/caja/resumen")
def caja_resumen(fecha: date | None = Query(default=None), current_user=Depends(admin_required)):
    inicio, fin = day_window(fecha)
    movimientos = supabase.table("movimientos_caja").select("id, tipo, monto, metodo_pago, descripcion, fecha, usuarios(nombre)").gte("fecha", inicio).lt("fecha", fin).order("fecha", desc=True).execute().data or []
    ingresos = sum((money(item["monto"]) for item in movimientos if item["tipo"] == "Ingreso"), Decimal(0))
    egresos = sum((money(item["monto"]) for item in movimientos if item["tipo"] == "Egreso"), Decimal(0))
    return {
        "fecha": (fecha or hoy_arg()).isoformat(),
        "ingresos": json_money(ingresos),
        "egresos": json_money(egresos),
        "saldo": json_money(ingresos - egresos),
        "movimientos": movimientos,
    }


@router.get("/caja/resumen-mensual")
def caja_resumen_mensual(mes: str | None = Query(default=None), current_user=Depends(admin_required)):
    inicio, fin = month_window(mes)
    # Solo traemos campos necesarios para optimizar
    movimientos = supabase.table("movimientos_caja").select("id, tipo, monto, fecha").gte("fecha", inicio).lt("fecha", fin).order("fecha", desc=True).execute().data or []
    ingresos = sum((money(item["monto"]) for item in movimientos if item["tipo"] == "Ingreso"), Decimal(0))
    egresos = sum((money(item["monto"]) for item in movimientos if item["tipo"] == "Egreso"), Decimal(0))
    
    # Agrupar ingresos por día (en hora Argentina) para un gráfico o resumen rápido
    ingresos_por_dia = {}
    for mov in movimientos:
        dia = datetime.fromisoformat(mov["fecha"]).astimezone(ZONA_ARG).strftime("%Y-%m-%d")
        if dia not in ingresos_por_dia:
            ingresos_por_dia[dia] = {"ingresos": Decimal(0), "egresos": Decimal(0)}
        if mov["tipo"] == "Ingreso":
            ingresos_por_dia[dia]["ingresos"] += money(mov["monto"])
        else:
            ingresos_por_dia[dia]["egresos"] += money(mov["monto"])
            
    resumen_dias = [
        {
            "fecha": dia,
            "ingresos": json_money(data["ingresos"]),
            "egresos": json_money(data["egresos"]),
            "saldo": json_money(data["ingresos"] - data["egresos"])
        } 
        for dia, data in sorted(ingresos_por_dia.items(), reverse=True)
    ]
    
    return {
        "mes": mes or hoy_arg().strftime("%Y-%m"),
        "ingresos": json_money(ingresos),
        "egresos": json_money(egresos),
        "saldo": json_money(ingresos - egresos),
        "total_movimientos": len(movimientos),
        "resumen_dias": resumen_dias
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


@router.get("/caja/gastos")
def listar_gastos(current_user=Depends(get_current_user)):
    """Lista los gastos (egresos). El admin ve todos; el chofer solo los suyos."""
    query = supabase.table("movimientos_caja").select("id, monto, metodo_pago, descripcion, fecha").eq("tipo", "Egreso")
    if current_user.get("roles", {}).get("nombre") != "ADMIN":
        query = query.eq("usuario_id", current_user["id"])
    return query.order("fecha", desc=True).limit(50).execute().data or []


@router.post("/caja/gastos")
def registrar_gasto(gasto: GastoChoferCreate, current_user=Depends(get_current_user)):
    """Registra un gasto del chofer (siempre egreso en efectivo). Se descuenta en el historial."""
    try:
        data = {
            "tipo": "Egreso",
            "monto": json_money(gasto.monto),
            "metodo_pago": "Efectivo",
            "usuario_id": current_user["id"],
            "descripcion": f"{gasto.categoria}" + (f" - {gasto.descripcion}" if gasto.descripcion else ""),
        }
        result = supabase.table("movimientos_caja").insert(data).execute()
        return result.data[0]
    except APIError as error:
        raise HTTPException(status_code=400, detail=error.message)


def efectivo_del_dia(inicio: str, fin: str) -> Decimal:
    """Efectivo esperado en caja = ingresos en efectivo - egresos en efectivo del período."""
    movimientos = supabase.table("movimientos_caja").select("tipo, monto, metodo_pago").gte("fecha", inicio).lt("fecha", fin).execute().data or []
    ingresos = sum((money(item["monto"]) for item in movimientos if item["tipo"] == "Ingreso" and item["metodo_pago"] == "Efectivo"), Decimal(0))
    egresos = sum((money(item["monto"]) for item in movimientos if item["tipo"] == "Egreso" and item["metodo_pago"] == "Efectivo"), Decimal(0))
    return ingresos - egresos


@router.get("/caja/cierre")
def get_cierre_caja(fecha: date | None = Query(default=None), current_user=Depends(admin_required)):
    inicio, fin = day_window(fecha)
    fecha_str = (fecha or hoy_arg()).isoformat()
    efectivo_esperado = efectivo_del_dia(inicio, fin)
    cierre = supabase.table("cierres_caja").select("*").eq("fecha", fecha_str).maybe_single().execute().data
    return {
        "fecha": fecha_str,
        "efectivo_esperado": json_money(efectivo_esperado),
        "cierre": cierre,
    }


@router.post("/caja/cierre")
def guardar_cierre_caja(payload: CierreCajaCreate, current_user=Depends(admin_required)):
    inicio, fin = day_window(payload.fecha)
    efectivo_esperado = efectivo_del_dia(inicio, fin)
    diferencia = payload.efectivo_contado - efectivo_esperado
    data = {
        "fecha": payload.fecha.isoformat(),
        "efectivo_esperado": json_money(efectivo_esperado),
        "efectivo_contado": json_money(payload.efectivo_contado),
        "diferencia": json_money(diferencia),
        "usuario_id": current_user["id"],
        "observaciones": payload.observaciones,
    }
    try:
        result = supabase.table("cierres_caja").upsert(data, on_conflict="fecha").execute()
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


@router.get("/metricas/resumen")
def metricas_resumen(fecha: date | None = Query(default=None), current_user=Depends(admin_required)):
    inicio, fin = day_window(fecha)
    pedidos = supabase.table("pedidos").select("id, total, estado").gte("created_at", inicio).lt("created_at", fin).execute().data or []
    ventas = supabase.table("ventas").select("total, metodo_pago").gte("fecha", inicio).lt("fecha", fin).execute().data or []
    caja = supabase.table("movimientos_caja").select("tipo, monto").gte("fecha", inicio).lt("fecha", fin).execute().data or []
    stock = supabase.table("productos").select("id, nombre, stock_actual, stock_minimo").order("stock_actual").execute().data or []
    ventas_total = sum((money(item["total"]) for item in ventas), Decimal(0))
    ingresos = sum((money(item["monto"]) for item in caja if item["tipo"] == "Ingreso"), Decimal(0))
    egresos = sum((money(item["monto"]) for item in caja if item["tipo"] == "Egreso"), Decimal(0))
    estados = {estado: sum(1 for pedido in pedidos if pedido["estado"] == estado) for estado in ["Pendiente", "Confirmado", "Asignado", "En reparto", "Entregado", "Cancelado"]}
    stock_bajo = []
    for item in stock:
        actual = item.get("stock_actual")
        minimo = item.get("stock_minimo")
        if actual is None:
            actual = 0
        if minimo is None:
            minimo = 5 # Por defecto 5 si es nulo en la DB
            
        if actual <= minimo:
            stock_bajo.append(item)

    return {
        "fecha": (fecha or hoy_arg()).isoformat(),
        "pedidos_total": len(pedidos),
        "pedidos_por_estado": estados,
        "ventas_total": json_money(ventas_total),
        "ingresos_caja": json_money(ingresos),
        "egresos_caja": json_money(egresos),
        "saldo_caja": json_money(ingresos - egresos),
        "stock_bajo": stock_bajo,
    }
