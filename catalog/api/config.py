import os

workers = int(os.environ.get('GUNICORN_PROCESSES', '3'))
threads = int(os.environ.get('GUNICORN_THREADS', '1'))

forwarded_allow_ips = os.environ.get('FORWARDED_ALLOW_IPS', '*')
secure_scheme_headers = { 'X-Forwarded-Proto': 'https' }
