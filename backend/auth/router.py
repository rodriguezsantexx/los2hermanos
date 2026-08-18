from fastapi import APIRouter, HTTPException
from schemas.user import UserLogin
from database.connection import supabase, SUPABASE_URL, SUPABASE_KEY
from supabase import create_client

router = APIRouter()

@router.post("/login")
def login(user: UserLogin):
    try:
        username = user.username.strip()
        profile_response = supabase.table("usuarios").select("id, nombre, email, roles(nombre)").eq("nombre", username).eq("activo", True).limit(1).execute()
        profiles = profile_response.data or []
        if not profiles:
            raise HTTPException(status_code=401, detail="Nombre de usuario o contraseña incorrectos")
        # Do not reuse the global database client: a successful login changes
        # its auth session and can make subsequent profile lookups use the
        # previous user's RLS context.
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        response = auth_client.auth.sign_in_with_password({
            "email": profiles[0]["email"],
            "password": user.password
        })
        return {"access_token": response.session.access_token, "user": response.user, "profile": profiles[0]}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas o error en Supabase")
