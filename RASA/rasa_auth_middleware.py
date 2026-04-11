from sanic import Sanic
from sanic.response import json
import os

API_KEY = os.getenv('RASA_API_KEY', 'cambiar-por-clave-segura-aleatoria')

def setup_auth_middleware(app: Sanic):
    @app.middleware('request')
    async def authenticate_request(request):
        if request.method == 'OPTIONS':
            return None
        
        api_key = request.headers.get('X-Rasa-Auth') or request.headers.get('Authorization')
        
        if api_key and api_key.startswith('Bearer '):
            api_key = api_key.replace('Bearer ', '')
        
        if not api_key or api_key != API_KEY:
            return json({
                'error': 'Unauthorized',
                'message': 'API key requerida. Incluye X-Rasa-Auth en los headers.'
            }, status=401)
        
        return None

