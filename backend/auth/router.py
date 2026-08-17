from fastapi import APIRouter, HTTPException
from schemas.user import UserLogin
from database.connection import supabase

router = APIRouter()

@router.post("/login")
def login(user: UserLogin):
    try:
        response = supabase.auth.sign_in_with_password({
            "email": user.email,
            "password": user.password
        })
        return {"access_token": response.session.access_token, "user": response.user}
    except Exception as e:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas o error en Supabase")
