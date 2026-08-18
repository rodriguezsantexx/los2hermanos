from pydantic import BaseModel, Field
from typing import Optional
from typing import Literal
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
    nombre: Optional[str] = None
    precio: Optional[Decimal] = None
    stock_minimo: Optional[int] = None
    estado: Optional[str] = None

class StockMovimiento(BaseModel):
    cantidad: int = Field(gt=0)
    tipo: Literal["Entrada", "Salida"]
    motivo: str = Field(min_length=1, max_length=100)
