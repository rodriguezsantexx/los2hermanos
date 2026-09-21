from dotenv import load_dotenv
load_dotenv()
from api.pedidos import crear_qr_instore
print(crear_qr_instore("test-12345", 100.50, "Pedido Prueba"))
