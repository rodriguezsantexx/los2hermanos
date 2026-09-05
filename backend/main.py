from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse
from auth.router import router as auth_router
from api.productos import router as productos_router
from api.pedidos import router as pedidos_router
from api.clientes import router as clientes_router
from api.finanzas import router as finanzas_router

app = FastAPI(title="Los 2 Hermanos API", version="1.0.0")


class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    """Reescribe los redirects (ej: trailing slash) a HTTPS cuando la petición
    original llegó por un proxy que terminó TLS (Railway, Heroku, etc.).

    Sin esto, FastAPI genera redirects con http:// y el navegador los bloquea
    por mixed content cuando la página se sirve por HTTPS.
    """

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if (
            isinstance(response, RedirectResponse)
            and request.headers.get("x-forwarded-proto") == "https"
        ):
            location = response.headers.get("location", "")
            if location.startswith("http://"):
                response.headers["location"] = "https://" + location[len("http://"):]
        return response


app.add_middleware(HTTPSRedirectMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["Autenticación"])
app.include_router(productos_router, prefix="/api/productos", tags=["Productos"])
app.include_router(pedidos_router, prefix="/api/pedidos", tags=["Pedidos"])
app.include_router(clientes_router, prefix="/api/clientes", tags=["Clientes"])
app.include_router(finanzas_router, prefix="/api/finanzas", tags=["Finanzas"])

@app.get("/")
def root():
    return {"message": "API de Los 2 Hermanos funcionando correctamente."}
