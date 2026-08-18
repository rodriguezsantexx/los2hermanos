import urllib.request, urllib.error
req = urllib.request.Request('http://localhost:8000/api/productos/123', data=b'{"precio":15}', headers={'Content-Type': 'application/json'}, method='PUT')
try:
    urllib.request.urlopen(req)
except urllib.error.HTTPError as e:
    print(e.code, e.read().decode())
