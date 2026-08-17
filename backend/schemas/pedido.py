from pydantic import BaseModel
from typing import List, Optional
from decimal import Decimal

class DetallePedidoCreate(BaseModel):
    producto_id: str
    cantidad: int
    precio_unitario: Decimal

class PedidoCreate(BaseModel):
    cliente_id: str
    localidad_id: str
    detalles: List[DetallePedidoCreate]
    metodo_pago: Optional[str] = None
    observaciones: Optional[str] = None

class PedidoStatusUpdate(BaseModel):
    estado: str
    metodo_pago: Optional[str] = None
