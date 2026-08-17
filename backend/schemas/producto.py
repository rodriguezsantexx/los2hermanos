from pydantic import BaseModel
from typing import Optional
from decimal import Decimal

class ProductoBase(BaseModel):
    nombre: str
    categoria_id: Optional[str] = None
    descripcion: Optional[str] = None
    precio: Decimal
    unidad: Optional[str] = None
    stock_actual: int
    stock_minimo: int = 0

class ProductoCreate(ProductoBase):
    pass

class ProductoUpdate(BaseModel):
    precio: Optional[Decimal] = None
    stock_minimo: Optional[int] = None
    estado: Optional[str] = None

class StockMovimiento(BaseModel):
    cantidad: int
    tipo: str # Entrada, Salida
    motivo: str
