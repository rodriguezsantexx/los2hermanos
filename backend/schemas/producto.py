from pydantic import BaseModel, Field
from typing import Optional
from typing import Literal
from decimal import Decimal

class ProductoBase(BaseModel):
    nombre: str
    categoria: str = "Gas"
    descripcion: Optional[str] = None
    precio: Decimal
    precio_retiro: Optional[Decimal] = None
    marca: Optional[str] = None
    cantidad: Optional[str] = None
    unidad: Optional[str] = None
    stock_actual: int
    stock_minimo: int = 0

class ProductoCreate(ProductoBase):
    pass

class ProductoUpdate(BaseModel):
    nombre: Optional[str] = None
    categoria: Optional[str] = None
    precio: Optional[Decimal] = None
    precio_retiro: Optional[Decimal] = None
    marca: Optional[str] = None
    cantidad: Optional[str] = None
    stock_minimo: Optional[int] = None
    estado: Optional[str] = None

class StockMovimiento(BaseModel):
    cantidad: int = Field(gt=0)
    tipo: Literal["Entrada", "Salida"]
    motivo: str = Field(min_length=1, max_length=100)
