bind = '127.0.0.1:8787'
workers = 2
timeout = 15
accesslog = None
errorlog = '-'
# Gunicorn errors are operational only; app never logs request bodies/headers.
