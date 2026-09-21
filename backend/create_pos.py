import os, requests, json
from dotenv import load_dotenv
load_dotenv()
mp_token = os.getenv("MERCADOPAGO_ACCESS_TOKEN")

# Create POS
pos_data = {
    "name": "Delivery QR",
    "fixed_amount": True,
    "store_id": 81325783,
    "external_id": "DELIVERY"
}

res = requests.post("https://api.mercadopago.com/pos", headers={"Authorization": f"Bearer {mp_token}"}, json=pos_data)
print("Create POS:", res.status_code, res.text)
