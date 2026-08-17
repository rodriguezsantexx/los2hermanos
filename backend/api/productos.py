from fastapi import APIRouter, HTTPException, Depends
from typing import List
from database.connection import supabase
from schemas.producto import ProductoCreate, ProductoUpdate, StockMovimiento
from auth.dependencies import admin_required, get_current_user

router = APIRouter()

@router.get("/")
def get_productos():
    res = supabase.table("productos").select("*").execute()
    return res.data

from postgrest.exceptions import APIError

@router.post("/")
def create_producto(producto: ProductoCreate): # Temporalmente libre para desarrollo frontend
    try:
        res = supabase.table("productos").insert(producto.model_dump(mode='json')).execute()
        return res.data[0]
    except APIError as e:
        raise HTTPException(status_code=400, detail=e.message)

@router.put("/{producto_id}")
def update_producto(producto_id: str, producto: ProductoUpdate, current_user=Depends(admin_required)):
    update_data = {k: v for k, v in producto.model_dump().items() if v is not None}
    res = supabase.table("productos").update(update_data).eq("id", producto_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return res.data[0]

@router.post("/{producto_id}/movimiento_stock")
def ajustar_stock(producto_id: str, movimiento: StockMovimiento, current_user=Depends(admin_required)):
    prod_res = supabase.table("productos").select("stock_actual").eq("id", producto_id).execute()
    if not prod_res.data:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    stock_actual = prod_res.data[0]["stock_actual"]
    nuevo_stock = stock_actual + movimiento.cantidad if movimiento.tipo == "Entrada" else stock_actual - movimiento.cantidad
    
    if nuevo_stock < 0:
        raise HTTPException(status_code=400, detail=f"Stock insuficiente. Stock actual: {stock_actual}")
        
    supabase.table("productos").update({"stock_actual": nuevo_stock}).eq("id", producto_id).execute()
    
    mov_data = {
        "producto_id": producto_id,
        "cantidad": movimiento.cantidad,
        "tipo": movimiento.tipo,
        "motivo": movimiento.motivo,
        "usuario_id": current_user["id"]
    }
    supabase.table("movimientos_stock").insert(mov_data).execute()
    
    return {"message": "Stock actualizado correctamente", "nuevo_stock": nuevo_stock}
