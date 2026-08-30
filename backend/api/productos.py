from fastapi import APIRouter, HTTPException, Depends
from typing import List
from database.connection import supabase
from schemas.producto import ProductoCreate, ProductoUpdate, StockMovimiento
from auth.dependencies import admin_required, get_current_user

router = APIRouter()

@router.get("/")
def get_productos():
    res = supabase.table("productos").select("*").order("nombre").execute()
    return res.data

@router.get("/movimientos_stock")
def get_movimientos_stock(limit: int = 20):
    res = (
        supabase.table("movimientos_stock")
        .select("id, producto_id, cantidad, tipo, motivo, fecha, productos(nombre)")
        .order("fecha", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data


@router.get("/alertas_stock")
def get_alertas_stock():
    res = (
        supabase.table("productos")
        .select("id, nombre, stock_actual, stock_minimo, unidad")
        .order("stock_actual")
        .execute()
    )

    alertas = []
    for producto in res.data:
        stock_actual = producto["stock_actual"]
        stock_minimo = producto["stock_minimo"]

        if stock_actual <= 0:
            nivel = "critica"
            mensaje = "Sin unidades disponibles"
        elif stock_actual <= stock_minimo:
            nivel = "baja"
            mensaje = f"Alcanzo el minimo configurado ({stock_minimo})"
        else:
            continue

        alertas.append({
            **producto,
            "nivel": nivel,
            "mensaje": mensaje,
            "faltante": max(stock_minimo - stock_actual, 0),
        })

    return alertas

from postgrest.exceptions import APIError

@router.post("/")
def create_producto(producto: ProductoCreate): # Temporalmente libre para desarrollo frontend
    try:
        res = supabase.table("productos").insert(producto.model_dump(mode='json')).execute()
        return res.data[0]
    except APIError as e:
        raise HTTPException(status_code=400, detail=e.message)

@router.put("/{producto_id}")
def update_producto(producto_id: str, producto: ProductoUpdate): # Temporalmente libre para desarrollo frontend
    try:
        # Supabase's JSON client cannot serialize Decimal instances returned by
        # Pydantic; convert the payload to JSON-compatible values first.
        update_data = {
            k: v for k, v in producto.model_dump(mode="json").items() if v is not None
        }
        res = supabase.table("productos").update(update_data).eq("id", producto_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        return res.data[0]
    except APIError as e:
        if "foreign key constraint" in str(e).lower() or "violates foreign key" in str(e).lower():
            raise HTTPException(
                status_code=409,
                detail="No se puede eliminar este producto porque tiene movimientos de stock o pedidos asociados."
            )
        raise HTTPException(status_code=400, detail=e.message)

@router.delete("/{producto_id}")
def delete_producto(producto_id: str):
    try:
        res = supabase.table("productos").delete().eq("id", producto_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        return {"message": "Producto eliminado correctamente"}
    except APIError as e:
        if "foreign key constraint" in str(e).lower() or "violates foreign key" in str(e).lower():
            raise HTTPException(
                status_code=409,
                detail="No se puede eliminar este producto porque ya tiene pedidos o movimientos de stock asociados."
            )
        raise HTTPException(status_code=400, detail=e.message)

@router.post("/{producto_id}/movimiento_stock")
def ajustar_stock(producto_id: str, movimiento: StockMovimiento): # Temporalmente libre para desarrollo frontend
    try:
        prod_res = supabase.table("productos").select("stock_actual").eq("id", producto_id).execute()
        if not prod_res.data:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        
        stock_actual = prod_res.data[0]["stock_actual"]
        nuevo_stock = stock_actual + movimiento.cantidad if movimiento.tipo == "Entrada" else stock_actual - movimiento.cantidad
        
        if nuevo_stock < 0:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente. Stock actual: {stock_actual}")
            
        update_res = supabase.table("productos").update({"stock_actual": nuevo_stock}).eq("id", producto_id).execute()
        if not update_res.data:
            raise HTTPException(status_code=400, detail="No se pudo actualizar el stock")
        
        mov_data = {
            "producto_id": producto_id,
            "cantidad": movimiento.cantidad,
            "tipo": movimiento.tipo,
            "motivo": movimiento.motivo,
            "usuario_id": None # current_user["id"] (Deshabilitado temporalmente)
        }
        mov_res = supabase.table("movimientos_stock").insert(mov_data).execute()
        
        return {
            "message": "Stock actualizado correctamente",
            "nuevo_stock": nuevo_stock,
            "movimiento": mov_res.data[0] if mov_res.data else None
        }
    except APIError as e:
        # Ignore insert errors in movimientos_stock due to missing auth/rls for now so we don't crash
        # or return the actual error so the frontend can display it correctly
        raise HTTPException(status_code=400, detail=e.message)
