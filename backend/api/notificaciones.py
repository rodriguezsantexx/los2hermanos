from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.dependencies import get_current_user
from database.connection import supabase
from utils.push import get_vapid_public_key

router = APIRouter()


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.get("/vapid-public-key")
def vapid_public_key():
    """Devuelve la clave pública VAPID para que el frontend pueda suscribirse."""
    key = get_vapid_public_key()
    if not key:
        raise HTTPException(status_code=500, detail="VAPID_PUBLIC_KEY no configurada")
    return {"public_key": key}


@router.post("/suscripcion")
def guardar_suscripcion(sub: PushSubscriptionCreate, current_user=Depends(get_current_user)):
    """Guarda (o actualiza) la suscripción push del usuario autenticado."""
    existing = (
        supabase.table("push_subscriptions")
        .select("id")
        .eq("endpoint", sub.endpoint)
        .maybe_single()
        .execute()
        .data
    )
    if existing:
        supabase.table("push_subscriptions").update({
            "p256dh": sub.p256dh,
            "auth": sub.auth,
            "usuario_id": current_user["id"],
        }).eq("id", existing["id"]).execute()
    else:
        supabase.table("push_subscriptions").insert({
            "usuario_id": current_user["id"],
            "endpoint": sub.endpoint,
            "p256dh": sub.p256dh,
            "auth": sub.auth,
        }).execute()
    return {"message": "Suscripción guardada"}


@router.delete("/suscripcion")
def eliminar_suscripcion(endpoint: str, current_user=Depends(get_current_user)):
    """Elimina la suscripción push (por endpoint)."""
    supabase.table("push_subscriptions").delete().eq("endpoint", endpoint).execute()
    return {"message": "Suscripción eliminada"}