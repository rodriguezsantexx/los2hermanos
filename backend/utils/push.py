import json
import os

from database.connection import supabase

try:
    from pywebpush import webpush
except ImportError:
    webpush = None


def get_vapid_public_key() -> str | None:
    return os.getenv("VAPID_PUBLIC_KEY")


def get_vapid_private_key() -> str | None:
    return os.getenv("VAPID_PRIVATE_KEY")


def url_para_rol(destinatario_rol: str) -> str:
    """Página de pedidos según el rol (para el click de la notificación push)."""
    if destinatario_rol == "CHOFER_LA_FALDA":
        return "/chofer/la-falda/pedidos"
    if destinatario_rol == "CHOFER_HUERTA_GRANDE":
        return "/chofer/huerta-grande/pedidos"
    return "/pedidos"


def enviar_push(titulo: str, mensaje: str, url: str | None, destinatario_rol: str):
    """Envía una notificación Web Push nativa a todos los usuarios con el rol dado.

    Las suscripciones se guardan en la tabla `push_subscriptions` (por usuario).
    Si una suscripción devuelve 404/410 (expirada/eliminada), se limpia.
    """
    if webpush is None:
        print("pywebpush no instalado, omitiendo push")
        return
    priv = get_vapid_private_key()
    if not priv:
        print("VAPID_PRIVATE_KEY no configurada, omitiendo push")
        return

    try:
        # Buscar los usuarios con ese rol
        users = supabase.table("usuarios").select("id, roles(nombre)").execute().data or []
        user_ids = [
            u["id"]
            for u in users
            if (u.get("roles") or {}).get("nombre") == destinatario_rol
        ]
        if not user_ids:
            return

        subs = (
            supabase.table("push_subscriptions")
            .select("*")
            .in_("usuario_id", user_ids)
            .execute()
            .data
            or []
        )
        if not subs:
            return

        if not url:
            url = url_para_rol(destinatario_rol)
        payload = json.dumps({"titulo": titulo, "mensaje": mensaje, "url": url})

        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub["endpoint"],
                        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                    },
                    data=payload,
                    vapid_private_key=priv,
                    vapid_claims={"sub": "mailto:admin@los2hermanos.com"},
                )
            except Exception as e:
                # 404/410 = suscripción expirada o eliminada → limpiar
                status = getattr(getattr(e, "response", None), "status_code", None)
                if status in (404, 410):
                    supabase.table("push_subscriptions").delete().eq("id", sub["id"]).execute()
                else:
                    print("Error enviando push:", str(e))
    except Exception as e:
        print("Error en enviar_push:", str(e))