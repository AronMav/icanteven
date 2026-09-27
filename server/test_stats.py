import io
import json
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from stats import create_app


class CounterTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.database = Path(self.directory.name) / 'counts.sqlite3'
        self.app = create_app(self.database, ['https://site.example'])

    def request(self, body=b'', path='/events', method='POST', origin='https://site.example', **changes):
        env = {'PATH_INFO': path, 'REQUEST_METHOD': method, 'HTTP_ORIGIN': origin,
               'CONTENT_TYPE': 'text/plain', 'CONTENT_LENGTH': str(len(body)), 'wsgi.input': io.BytesIO(body)}
        env.update(changes)
        result = {}
        def start(status, headers):
            result.update(status=int(status.split()[0]), headers=dict(headers))
        result['body'] = json.loads(b''.join(self.app(env, start)))
        return result

    def test_counts_and_storage_survive_restart(self):
        self.request(b'disperse')
        self.app = create_app(self.database, ['https://site.example'])
        response = self.request(path='/stats', method='GET')
        self.assertEqual(response['body'], {'dispersed': 1})
        self.assertEqual(response['headers']['Cache-Control'], 'no-store')
        self.assertNotIn('Set-Cookie', response['headers'])

    def test_no_user_data_in_database(self):
        self.request(b'disperse', HTTP_COOKIE='identity=secret', REMOTE_ADDR='192.0.2.1', HTTP_USER_AGENT='secret-agent')
        with closing(sqlite3.connect(self.database)) as db:
            columns = [row[1] for row in db.execute('PRAGMA table_info(daily)')]
            self.assertEqual(columns, ['day', 'dispersed'])
            self.assertEqual(len(db.execute('SELECT * FROM daily').fetchall()), 1)

    def test_rejects_unknown_origins_events_and_payloads(self):
        for body in (b'visit', b'hello', b'{"text":"secret"}', b'disperse extra', b''):
            self.assertEqual(self.request(body)['status'], 400)
        for origin in ('', 'null', 'https://other.example'):
            response = self.request(b'disperse', origin=origin)
            self.assertEqual(response['status'], 403)
            self.assertNotIn('Access-Control-Allow-Origin', response['headers'])
        self.assertEqual(self.request(b'disperse', CONTENT_TYPE='application/json')['status'], 415)
        self.assertEqual(self.request(b'disperse', CONTENT_LENGTH='')['status'], 411)
        self.assertEqual(self.request(b'disperse', QUERY_STRING='text=secret')['status'], 404)
        self.assertEqual(self.request(path='/stats', method='GET')['body'], {'dispersed': 0})

    def test_parallel_events_are_not_lost(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.request(b'disperse'), range(40)))
        self.assertTrue(all(result['status'] == 200 for result in results))
        self.assertEqual(self.request(path='/stats', method='GET')['body']['dispersed'], 40)

    def test_reads_do_not_increment_and_methods_are_restricted(self):
        for _ in range(2):
            self.assertEqual(self.request(path='/stats', method='GET')['body'], {'dispersed': 0})
        self.assertEqual(self.request(method='GET')['status'], 405)
        self.assertEqual(self.request(path='/stats')['status'], 405)

    def test_migration_removes_visits_and_preserves_dispersals(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute('DROP TABLE daily')
            db.execute('CREATE TABLE daily(day TEXT PRIMARY KEY, visits INTEGER NOT NULL DEFAULT 0, dispersed INTEGER NOT NULL DEFAULT 0)')
            db.execute("INSERT INTO daily VALUES ('2026-09-26', 10, 3), ('2026-09-27', 5, 0)")
        self.app = create_app(self.database, ['https://site.example'])
        self.assertEqual(self.request(path='/stats', method='GET')['body'], {'dispersed': 3})
        with closing(sqlite3.connect(self.database)) as db:
            self.assertEqual([row[1] for row in db.execute('PRAGMA table_info(daily)')], ['day', 'dispersed'])
            self.assertEqual(db.execute('SELECT * FROM daily').fetchall(), [('2026-09-26', 3)])
        self.assertEqual(self.request(b'visit')['status'], 400)
        self.assertEqual(self.request(b'disperse')['body'], {'dispersed': 4})


if __name__ == '__main__':
    unittest.main()
