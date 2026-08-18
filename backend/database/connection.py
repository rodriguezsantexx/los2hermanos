import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
# FastAPI runs on the server and must use the service-role key for its
# database mutations. The public/anon key is subject to Supabase RLS policies.
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    # Will not raise error immediately to allow simple `uvicorn main:app` tests, but will fail on query.
    print("WARNING: Missing Supabase credentials in .env file")
    SUPABASE_URL = "https://example.supabase.co"
    SUPABASE_KEY = "example-key"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
