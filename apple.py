import time
import jwt

# Tus datos de configuración
team_id = 'VY93Z2D6Y4'
client_id = 'com.termibululu.vhortosecreto'
key_id = '2UA9NNQFZQ'
key_path = 'IPHONE-VhortoSecreto-Supabase-SignWithApple-AuthKey_2UA9NNQFZQ.p8'

with open(key_path, 'r') as f:
    private_key = f.read()

headers = {
    'alg': 'ES256',
    'kid': key_id
}

payload = {
    'iss': team_id,
    'iat': int(time.time()),
    'exp': int(time.time()) + (180 * 24 * 60 * 60), # 6 meses (máximo permitido)
    'aud': 'https://appleid.apple.com',
    'sub': client_id
}

token = jwt.encode(payload, private_key, algorithm='ES256', headers=headers)
print("\n👇 COPIA ESTE CÓDIGO PARA SUPABASE 👇\n")
print(token)
print("\n👆 COPIA ESTE CÓDIGO PARA SUPABASE 👆\n")
