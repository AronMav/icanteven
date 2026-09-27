# Счётчик развеяний

Python 3.10+ с SQLite. Хранит дату UTC и количество развеяний. Посещения, текст записей и данные посетителей не сохраняются.

| Запрос | Результат |
| --- | --- |
| `GET /stats` | Общая сумма: `{"dispersed":0}` |
| `POST /events` | Увеличивает сумму на один и возвращает её |

Для POST нужны `Content-Type: text/plain`, тело `disperse` и Origin из `STATS_ORIGINS`. Ответы не кэшируются. Счётчик приблизительный: без идентификаторов он не отличает реальные действия от искусственных запросов.

## Локальный запуск

Из корня проекта в PowerShell:

```powershell
$env:STATS_ORIGINS = 'http://127.0.0.1:5173'
$env:STATS_DB = 'artifacts/statistics-local.sqlite3'
python server/stats.py
```

В другом терминале:

```powershell
$env:VITE_STATS_ENDPOINT = 'http://127.0.0.1:8787/events'
$env:VITE_STATS_IN_DEV = '1'
npm run dev -- --port 5173 --strictPort
```

Без `VITE_STATS_ENDPOINT` клиент не отправляет запросы и показывает «—». Ошибки счётчика не мешают редактору.

Проверка: `python -B -m unittest discover -s server -p "test_*.py"`.

Встроенный сервер предназначен для разработки. Рабочая конфигурация использует Gunicorn и Caddy; база хранится отдельно от выпусков сайта. HTTP-журналы посетителей отключены.
