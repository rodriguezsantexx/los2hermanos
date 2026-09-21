import os, requests, json
from dotenv import load_dotenv
load_dotenv()
mp_token = os.getenv("MERCADOPAGO_ACCESS_TOKEN")
user_id = 382690064

order_data = {
  "external_reference": "test-order-1",
  "title": "Pedido Prueba", "description": "Pedido de prueba",
  "total_amount": 10.0,
  "items": [
    {
       "title": "Pedido",
       "unit_price": 10.0,
       "quantity": 1,
       "unit_measure": "unit",
       "total_amount": 10.0
    }
  ]
}

res = requests.put(f"https://api.mercadopago.com/instore/orders/qr/seller/collectors/{user_id}/pos/DELIVERY/qrs", headers={"Authorization": f"Bearer {mp_token}"}, json=order_data)
print("Create Instore Order:", res.status_code, res.text)
