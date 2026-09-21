import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()
mp_token = os.getenv("MERCADOPAGO_ACCESS_TOKEN")
user_id = 382690064

# Try to get store
res = requests.get(f"https://api.mercadopago.com/users/{user_id}/stores/search", headers={"Authorization": f"Bearer {mp_token}"})
print("Stores:", res.status_code, res.text)
stores = res.json().get("results", [])

store = stores[0] if stores else None
if store:
    store_id = store["id"]
    external_store_id = store.get("external_id")
    print(f"Found store: {store_id}, external_id: {external_store_id}")
    
    if not external_store_id:
        print("Store doesn't have external_id, creating a new store with external_id...")
        store_data = {
            "name": "Local Delivery",
            "business_hours": {
                "monday": [{"open": "08:00", "close": "23:59"}]
            },
            "location": {
                "street_number": "123",
                "street_name": "San Martin",
                "city_name": "La Falda",
                "state_name": "Córdoba",
                "latitude": -31.0,
                "longitude": -64.0,
                "reference": "Local"
            },
            "external_id": "STORE-DELIVERY"
        }
        res = requests.post(f"https://api.mercadopago.com/users/{user_id}/stores", headers={"Authorization": f"Bearer {mp_token}"}, json=store_data)
        print("Create new store:", res.status_code, res.text)
        store = res.json()
        store_id = store["id"]
        external_store_id = store["external_id"]
else:
    print("No stores found.")
    exit(1)

# Create POS
pos_data = {
    "name": "Delivery QR",
    "fixed_amount": True,
    "store_id": store_id,
    "external_store_id": external_store_id,
    "external_id": "DELIVERY"
}

res = requests.post("https://api.mercadopago.com/pos", headers={"Authorization": f"Bearer {mp_token}"}, json=pos_data)
print("Create POS:", res.status_code, res.text)
