from fastapi import APIRouter, HTTPException, Depends
from database.connection import supabase
from schemas.cliente import ClienteCreate, ClienteUpdate
from auth.dependencies import get_current_user
from postgrest.exceptions import APIError

router = APIRouter()

@router.get("/")
def get_clientes(current_user=Depends(get_current_user)):
    return supabase.table("clientes").select("*, localidades(nombre)").order("nombre").execute().data

@router.get("/localidades")
def get_localidades(current_user=Depends(get_current_user)):
    return supabase.table("localidades").select("id, nombre").order("nombre").execute().data

@router.post("/")
def create_cliente(cliente: ClienteCreate, current_user=Depends(get_current_user)):
    try:
        return supabase.table("clientes").insert(cliente.model_dump(mode="json")).execute().data[0]
    except APIError as e:
        raise HTTPException(status_code=400, detail=e.message)

@router.put("/{cliente_id}")
def update_cliente(cliente_id: str, cliente: ClienteUpdate, current_user=Depends(get_current_user)):
    try:
        data = {k: v for k, v in cliente.model_dump(mode="json").items() if v is not None}
        res = supabase.table("clientes").update(data).eq("id", cliente_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        return res.data[0]
    except APIError as e:
        raise HTTPException(status_code=400, detail=e.message)
