import sys

content = open("api/pedidos.py").read()

imports = """
from datetime import datetime, timezone, timedelta, time
"""
content = content.replace("from datetime import datetime, timezone", imports)

horario_func = """
def check_horario_abierto(tipo_pedido: str):
    now_ar = datetime.now(timezone.utc) - timedelta(hours=3)
    if now_ar.weekday() == 6: # Domingo
        raise HTTPException(status_code=400, detail="CERRADO_DOMINGO")
        
    hora = now_ar.time()
    
    if tipo_pedido.lower() == "local":
        if not (time(9, 0) <= hora <= time(21, 0)):
            raise HTTPException(status_code=400, detail="CERRADO_DEPOSITO")
    else:
        # Reparto
        if not ((time(9, 0) <= hora <= time(14, 0)) or (time(17, 0) <= hora <= time(20, 30))):
            raise HTTPException(status_code=400, detail="CERRADO_REPARTO")

@router.post("/bot")
"""
content = content.replace("@router.post(\"/bot\")", horario_func)

bot_start = """def create_pedido_bot(pedido: PedidoBot):
    check_horario_abierto(pedido.tipo_pedido)
"""
content = content.replace("def create_pedido_bot(pedido: PedidoBot):", bot_start)

with open("api/pedidos.py", "w") as f:
    f.write(content)

