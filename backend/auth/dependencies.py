from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database.connection import supabase

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Token inválido o expirado")
        
        # Consultar la tabla interna de usuarios para traer el rol
        db_user = supabase.table("usuarios").select("*, roles(nombre)").eq("auth_id", user_response.user.id).single().execute()
        
        if not db_user.data:
            raise HTTPException(status_code=401, detail="Perfil interno de usuario no encontrado")
            
        return db_user.data
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

def require_role(allowed_roles: list[str]):
    def role_checker(current_user: dict = Depends(get_current_user)):
        user_role = current_user.get("roles", {}).get("nombre")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403, 
                detail=f"Permisos insuficientes. Se requiere uno de: {', '.join(allowed_roles)}"
            )
        return current_user
    return role_checker

# Dependencias pre-configuradas para inyectar en los endpoints
admin_required = require_role(["ADMIN"])
chofer_la_falda_required = require_role(["ADMIN", "CHOFER_LA_FALDA"])
chofer_huerta_grande_required = require_role(["ADMIN", "CHOFER_HUERTA_GRANDE"])
