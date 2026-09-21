import os
from database.connection import supabase

try:
    res = supabase.table("pedidos").select("id, mp_qr_data").limit(1).execute()
    print("Success:", res.data)
except Exception as e:
    print("Error:", e)
