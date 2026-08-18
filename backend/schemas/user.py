from pydantic import BaseModel, EmailStr
from typing import Optional

class UserLogin(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    nombre: str
    telefono: Optional[str] = None
    rol_id: str
