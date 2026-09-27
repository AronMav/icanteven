"""Own aggregate counter. No visitor records, cookies, IPs or request logs."""
import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit
from wsgiref.simple_server import WSGIRequestHandler, make_server


def create_app(database, origins):
    origins = frozenset(origins)
    if not origins:
        raise ValueError('STATS_ORIGINS must contain the site origin')
    for origin in origins:
        url = urlsplit(origin)
        if url.scheme not in ('http', 'https') or not url.netloc or url.path or url.query or url.fragment or url.username or url.password:
            raise ValueError('STATS_ORIGINS must contain exact HTTP(S) origins, without paths')
    database = Path(database)
    database.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(database)) as db, db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('BEGIN IMMEDIATE')
        db.execute('CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, dispersed INTEGER NOT NULL DEFAULT 0)')
        if 'visits' in [row[1] for row in db.execute('PRAGMA table_info(daily)')]:
            # Remove the retired count while preserving all dispersals atomically.
            db.execute('CREATE TABLE daily_dispersed (day TEXT PRIMARY KEY, dispersed INTEGER NOT NULL DEFAULT 0)')
            db.execute('INSERT INTO daily_dispersed SELECT day, dispersed FROM daily WHERE dispersed > 0')
            db.execute('DROP TABLE daily')
            db.execute('ALTER TABLE daily_dispersed RENAME TO daily')

    def app(environ, start_response):
        origin = environ.get('HTTP_ORIGIN', '')
        headers = [('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff'), ('Vary', 'Origin')]
        if origin in origins:
            headers.append(('Access-Control-Allow-Origin', origin))

        def reply(status, payload):
            body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
            start_response(status, headers + [('Content-Type', 'application/json'), ('Content-Length', str(len(body)))])
            return [body]

        # Do not retain URLs, query parameters, headers, IPs or event histories.
        path, method = environ.get('PATH_INFO'), environ.get('REQUEST_METHOD')
        if environ.get('QUERY_STRING') or path not in ('/events', '/stats'):
            return reply('404 Not Found', {'error': 'not_found'})
        event = None
        if path == '/events':
            if method != 'POST':
                return reply('405 Method Not Allowed', {'error': 'method'})
            if origin not in origins:
                return reply('403 Forbidden', {'error': 'origin'})
            if environ.get('CONTENT_TYPE', '').split(';')[0].lower() != 'text/plain':
                return reply('415 Unsupported Media Type', {'error': 'content_type'})
            try:
                length = int(environ.get('CONTENT_LENGTH', ''))
            except ValueError:
                return reply('411 Length Required', {'error': 'length'})
            if length != 8:
                return reply('400 Bad Request', {'error': 'event'})
            event = environ['wsgi.input'].read(length)
            if len(event) != length or event != b'disperse':
                return reply('400 Bad Request', {'error': 'event'})
        elif method != 'GET':
            return reply('405 Method Not Allowed', {'error': 'method'})
        try:
            with closing(sqlite3.connect(database, timeout=5)) as db, db:
                if event:
                    day = datetime.now(timezone.utc).date().isoformat()
                    db.execute('INSERT INTO daily(day, dispersed) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET dispersed = dispersed + 1', (day,))
                dispersed, = db.execute('SELECT COALESCE(SUM(dispersed), 0) FROM daily').fetchone()
            return reply('200 OK', {'dispersed': dispersed})
        except sqlite3.Error:
            return reply('503 Service Unavailable', {'error': 'unavailable'})

    return app


@lru_cache(maxsize=1)
def configured_app():
    return create_app(os.environ.get('STATS_DB', 'artifacts/statistics.sqlite3'),
                      [value.strip() for value in os.environ.get('STATS_ORIGINS', '').split(',') if value.strip()])


def application(environ, start_response):
    return configured_app()(environ, start_response)


class QuietHandler(WSGIRequestHandler):
    def log_message(self, format, *args):
        pass


if __name__ == '__main__':
    # Development only. Production: WSGI server behind a buffering HTTPS proxy.
    configured_app()
    port = int(os.environ.get('STATS_PORT', '8787'))
    with make_server('127.0.0.1', port, application, handler_class=QuietHandler) as server:
        print(f'Aggregate counter: http://127.0.0.1:{port}', flush=True)
        server.serve_forever()
