from database.connection import supabase


def crear_notificacion(
    tipo: str,
    titulo: str,
    mensaje: str,
    destinatario_rol: str,
    pedido_id: str | None = None,
    destinatario_id: str | None = None,
):
    """Inserta una notificación para un rol (o usuario) específico.

    Las notificaciones se consumen en tiempo real por el frontend vía
    Supabase Realtime (tabla `notificaciones`).
    """
    try:
        supabase.table("notificaciones").insert({
            "tipo": tipo,
            "titulo": titulo,
            "mensaje": mensaje,
            "destinatario_rol": destinatario_rol,
            "destinatario_id": destinatario_id,
            "pedido_id": pedido_id,
        }).execute()
    except Exception as e:
        print("Error creando notificación:", str(e))