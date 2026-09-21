import os, requests, json
from dotenv import load_dotenv
load_dotenv()
mp_token = os.getenv("MERCADOPAGO_ACCESS_TOKEN")
user_id = 382690064

res = requests.get(f"https://api.mercadopago.com/pos?external_id=DELIVERY", headers={"Authorization": f"Bearer {mp_token}"})
print(res.text)
