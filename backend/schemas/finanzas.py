from datetime import date
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field


class PagoCreate(BaseModel):
    cliente_id: str
    monto: Decimal = Field(gt=0)
    metodo_pago: str = Field(min_length=2, max_length=50)


class MovimientoCajaCreate(BaseModel):
    tipo: Literal["Ingreso", "Egreso"]
    monto: Decimal = Field(gt=0)
    metodo_pago: str = Field(min_length=2, max_length=50)
    descripcion: Optional[str] = None


class CierreCajaCreate(BaseModel):
    fecha: date
    efectivo_contado: Decimal = Field(ge=0)
    observaciones: Optional[str] = None


class GastoChoferCreate(BaseModel):
    monto: Decimal = Field(gt=0)
    categoria: str = Field(min_length=2, max_length=50)
    descripcion: Optional[str] = None
