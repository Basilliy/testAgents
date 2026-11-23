# План: 002-run-test-page

Попытка 1. Все команды выполняются из корня проекта `/Users/ruslandrugak/PhpstormProjects/testAgents`. На хосте нет `php` и `composer` (Ф3), поэтому любая команда `php`/`artisan` запускается только через `docker compose exec -T app ...`.

## Подход

Тестовая страница — маршрут `GET /test` в `routes/web.php`, отдающий новый Blade-шаблон `resources/views/test.blade.php` со строкой-маркером `test-page-ok`. Форма повторяет существующий маршрут `/` (замыкание + `view(...)`), поэтому новых классов и зависимостей не появляется. Проект уже запущен и миграции применены (Ф4, Ф7), поэтому запуск и миграции выполняются идемпотентными командами `docker compose up -d --wait` и `php artisan migrate --force` без пересборки и без удаления томов. К странице добавляется один feature-тест, чтобы статус 200 и маркер проверялись и в `php artisan test`. Порядок шагов такой, что шаблон создаётся раньше маршрута: в любой момент все зарегистрированные маршруты рабочие.

Отвергнутые варианты:

- Замыкание, возвращающее строку без шаблона, — это ответ, а не «страница»; выигрыша в простоте почти нет.
- Отдельный контроллер — лишний класс ради одной строки `view('test')`.
- Статический файл в `public/` — противоречит Д3 (страница должна обслуживаться Laravel).
- Чистый перезапуск `docker compose down -v` / `migrate:fresh` — уничтожает данные базы, задачей не запрошено (Д5).
- `docker compose up -d --build` — пересборка образа не нужна: `Dockerfile` не меняется, код смонтирован томом (Ф12).

## Зафиксированные решения

- Адрес страницы: `/test`, метод `GET`. Имя маршрута не задаётся, middleware не добавляются.
- Имя представления: `test`, файл `resources/views/test.blade.php`.
- Строка-маркер (для К8): `test-page-ok`. Проверено: в ответе `/` её нет (`curl -s http://localhost:8000/ | grep -c 'test-page-ok'` → `0`).
- Файл теста: `tests/Feature/TestPageTest.php`, класс `Tests\Feature\TestPageTest`.

## Шаги

### Шаг 1. Исходное состояние

Файлы: не меняются.

Что сделать — выполнить три команды и сверить вывод:

1. `shasum routes/web.php` → `2f63d05f77bbdde1a6ef48ce7c5d4dc1f126afa3  routes/web.php`.
2. `ls resources/views tests/Feature` → в `resources/views` только `welcome.blade.php`, в `tests/Feature` только `ExampleTest.php`.
3. `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/test` → `404`. Если вместо кода пришло `000` (приложение не отвечает) — это не расхождение, перейти к шагу 2 и повторить эту команду после него.

Если сумма в п. 1 другая, список файлов в п. 2 другой или п. 3 даёт `200` — остановиться со статусом `BLOCKED`: проект не в том состоянии, от которого построен план.

### Шаг 2. Запуск проекта и миграции

Файлы: не меняются.

Что сделать, строго в этом порядке:

1. `docker compose up -d --wait` — без `--build` и без других флагов. Команда идемпотентна: работающие контейнеры не пересоздаются. Ожидается код возврата 0.
2. `docker compose exec -T app php artisan migrate --force` — ожидается код возврата 0 и строка `Nothing to migrate` в выводе. Если вместо неё выведены миграции с отметкой `DONE` — это тоже успех (они были не применены и применились); выполнить команду второй раз и получить `Nothing to migrate`.

Запрещено: `docker compose down` с любыми флагами, `migrate:fresh`, `migrate:refresh`, `migrate:rollback`, `db:wipe`, `route:cache`, `config:cache`, `optimize`.

Проверка шага:

- `docker compose ps -a --format '{{.Service}} {{.State}}' | sort` → ровно четыре строки: `app running`, `postgres running`, `queue running`, `redis running`.
- `docker compose ps app --format '{{.Health}}'` → `healthy`.
- `docker compose exec -T app php artisan migrate:status | grep -c 'Ran'` → `3`.
- `docker compose exec -T app php artisan migrate:status | grep -c 'Pending'` → `0`.

Если команда п. 1 завершилась с ненулевым кодом или `app` не `healthy` — остановиться со статусом `BLOCKED`, приложив вывод `docker compose logs --tail=50 app`. Файлы окружения не править.

### Шаг 3. Шаблон страницы

Файлы: `resources/views/test.blade.php` — создать.

Содержимое файла — ровно такое (отступы 4 пробела, окончания строк LF, в конце файла один перевод строки, кодировка UTF-8):

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Test page</title>
</head>
<body>
    <h1>Test page</h1>
    <p>test-page-ok</p>
</body>
</html>
```

Ничего не добавлять: никаких директив Blade, `@vite`, подключения CSS/JS (фронтенд не собран, `@vite` вызвал бы ошибку 500).

Проверка шага:

- `grep -c 'test-page-ok' resources/views/test.blade.php` → `1`.
- `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/` → `200` (существующее не задето).

### Шаг 4. Маршрут

Файлы: `routes/web.php` — изменить.

Что сделать: строки 1–7 файла не менять. В конец файла, после строки 7 (`});`), дописать пустую строку и три строки маршрута, чтобы файл заканчивался так (после последней `});` — один перевод строки):

```php
Route::get('/', function () {
    return view('welcome');
});

Route::get('/test', function () {
    return view('test');
});
```

Новых `use` не добавлять. Итоговый файл — 11 строк.

Проверка шага (в этом порядке):

1. `docker compose exec -T app php -l routes/web.php` → `No syntax errors detected in routes/web.php`. Если вывод иной — немедленно исправить файл до совпадения с фрагментом выше: синтаксическая ошибка здесь ломает `/`, `/up` и healthcheck контейнера.
2. `wc -l < routes/web.php` → `11`.
3. `docker compose exec -T app php artisan route:list --path=test | grep -cE 'GET\|HEAD +test'` → `1`.
4. `sleep 3; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/test` → `200`. Пауза нужна из-за `opcache.revalidate_freq=2`. Контейнеры не перезапускать: кэша маршрутов нет (Ф11), код смонтирован томом (Ф12).
5. `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/up` → `200`.

Если п. 4 даёт `500` — посмотреть `docker compose exec -T app tail -n 30 storage/logs/laravel.log`, сверить `resources/views/test.blade.php` и `routes/web.php` с текстом шагов 3 и 4 и исправить расхождение. Если файлы совпадают с планом, а код не `200`, — `BLOCKED` с этим выводом.

### Шаг 5. Тест страницы

Файлы: `tests/Feature/TestPageTest.php` — создать.

Что сделать — файл по образцу `tests/Feature/ExampleTest.php`:

- `<?php`, пустая строка, `namespace Tests\Feature;`, пустая строка, `use Tests\TestCase;`;
- класс `TestPageTest extends TestCase`;
- один метод `public function test_the_test_page_returns_a_successful_response(): void`, в теле три действия: `$response = $this->get('/test');`, затем `$response->assertStatus(200);`, затем `$response->assertSee('test-page-ok');`;
- трейт `RefreshDatabase` и закомментированный `use` для него не добавлять: страница не обращается к базе;
- отступы 4 пробела, LF, один перевод строки в конце.

`tests/Feature/ExampleTest.php`, `tests/Unit/ExampleTest.php`, `tests/TestCase.php`, `phpunit.xml` не менять.

Проверка шага:

- `docker compose exec -T app php -l tests/Feature/TestPageTest.php` → `No syntax errors detected in tests/Feature/TestPageTest.php`.
- `docker compose exec -T app php artisan test; echo "rc=$?"` → в выводе `3 passed`, слова `failed` нет, последняя строка `rc=0`.

Прогон тестов перезаписывает `.phpunit.result.cache` в корне проекта — это ожидаемо, файл в `.gitignore`.

## Тесты

- Новый: `tests/Feature/TestPageTest.php::test_the_test_page_returns_a_successful_response` — `GET /test` отдаёт статус 200 и тело содержит `test-page-ok` (маршрут зарегистрирован, шаблон найден и рендерится).
- Без изменений: `tests/Feature/ExampleTest.php` (`/` → 200) и `tests/Unit/ExampleTest.php` — должны проходить как раньше.
- Тесты идут на SQLite в памяти (Ф13); применение миграций к PostgreSQL проверяется не тестами, а командами К3–К5.

## Итоговая проверка

Выполнить все пункты после шага 5 и привести фактический вывод в `code-report.md`.

| Критерий | Команда | Ожидается |
|---|---|---|
| К1 | `docker compose ps -a --format '{{.Service}} {{.State}}' \| sort` | ровно 4 строки: `app running`, `postgres running`, `queue running`, `redis running` |
| К2 | `docker compose ps app --format '{{.Health}}'` | `healthy` |
| К3 | `docker compose exec -T app php artisan migrate:status` | 3 строки миграций, каждая с `Ran`; слова `Pending` нет; `ls database/migrations \| wc -l` → `3` |
| К4 | `docker compose exec -T app php artisan migrate --force; echo "rc=$?"` | вывод содержит `Nothing to migrate`, `rc=0` |
| К5 | `docker compose exec -T app php artisan migrate:status --database=pgsql; echo "rc=$?"` | те же 3 строки `Ran`, `rc=0` |
| К5 | `docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select count(*) from migrations"'` | `3` |
| К6 | `docker compose exec -T app php artisan route:list --path=test` | есть строка, начинающаяся с `GET\|HEAD  test`, со ссылкой на `routes/web.php:9` |
| К7 | `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/test` | `200` |
| К8 | `curl -s http://localhost:8000/test \| grep -c 'test-page-ok'` | `1` |
| К8 | `curl -s http://localhost:8000/ \| grep -c 'test-page-ok'` | `0` |
| К9 | `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/` | `200` |
| К9 | `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/up` | `200` |
| К9 | `docker compose exec -T app php artisan test; echo "rc=$?"` | `3 passed`, слова `failed` нет, `rc=0` |
| К10 | команда `shasum -c` ниже | 19 строк, каждая оканчивается на `: OK`; `rc=0` |

Команда для К10 (исходные суммы сняты на этапе плана 2026-11-21 до любых изменений; первые 11 совпадают с суммами из `review-analysis-1.md`):

```sh
shasum -c - <<'EOF'; echo "rc=$?"
df08ee8aeccc11a03d0bae2cfeb2c16f11d5f2fd  compose.yaml
d7eaf7f2f6017c9821a8dd15586b58053029e5cf  docker/app/Dockerfile
e4e0576ed1922e1a67054046ec897fd324aa8802  .env
4a15600eac276bfdf3a67d32e2ecb54918dd753a  .env.example
7777964e4cc4c878dbcf4538383bf12b4f989067  README.md
844bd1deb745def7900476e69be1caaea2f45ac3  .claude/settings.json
8f80cf78e6f999b589d840063812089863992ce6  .claude/agents/analyst.md
754ac8d461245792a54703be90c36d2ac4a27407  .claude/agents/coder.md
a5bd032f2c1862c5ec438cfc9fe511d15ed3ddd2  .claude/agents/orchestrator.md
3f0a45c7fa143669a6a8be2955cfa4fba726491c  .claude/agents/planner.md
085ab50b0f0371a5d06ca82de6e62a0e7741b8df  .claude/agents/reviewer.md
7a80a1d71107061d072d1a3519c4f9e69413bd5c  pipeline/001-laravel-docker-setup/analysis.md
62e50a9de74f58a4f26a48e3a69b6754274cc19d  pipeline/001-laravel-docker-setup/code-report.md
f5988cfa3be603383179f5376315b8742bda682f  pipeline/001-laravel-docker-setup/plan.md
c9fd860d3fa79fe2f2460798913325ffdf24e701  pipeline/001-laravel-docker-setup/report.md
5147a90521f1213506b41bee28b4dfb36c872571  pipeline/001-laravel-docker-setup/review-analysis-1.md
7d75eaeb9b2d8d8c5f16d4f14fd5a43ffec2dee2  pipeline/001-laravel-docker-setup/review-code-1.md
e21927b602f02aaa01b124678cc0e6f8d4f8d2f7  pipeline/001-laravel-docker-setup/review-plan-1.md
24b5f34df42c0d77b39fe96c1c2bfcff42db4a8e  pipeline/001-laravel-docker-setup/task.md
EOF
```

Дополнительно к К10 — в `.claude/` и `pipeline/001-laravel-docker-setup/` не появилось новых файлов:
`find .claude pipeline/001-laravel-docker-setup -type f | wc -l` → `14`.

## Не трогаем

- `compose.yaml`, `docker/app/Dockerfile`, `.env`, `.env.example`, `README.md`, `TODO.md`, `.claude/`, `pipeline/001-laravel-docker-setup/`.
- `resources/views/welcome.blade.php`, строки 1–7 `routes/web.php`, `routes/console.php`, `bootstrap/app.php`.
- `database/` целиком: новых миграций, моделей, сидов нет.
- `tests/Feature/ExampleTest.php`, `tests/Unit/ExampleTest.php`, `tests/TestCase.php`, `phpunit.xml`.
- `app/`, `config/`, `public/`, `composer.json`, `composer.lock`, `package.json`, `vendor/`; `npm install` и `npm run build` не выполняются.
- Тома Docker `pgdata` и `redisdata`; образ не пересобирается; контейнеры не перезапускаются вручную.
- Git не инициализируется, коммиты не делаются.
- В папку `pipeline/002-run-test-page/` coder пишет только `code-report.md`.

Побочные изменения, которые ожидаемы и дефектом не являются: `.phpunit.result.cache` (перезапись при прогоне тестов), новый скомпилированный файл в `storage/framework/views/`, новые ключи сессий в Redis, возможные записи в `storage/logs/laravel.log`.

## Расхождения с анализом

Расхождений, меняющих решение, нет. Состояние перепроверено на этапе плана: четыре контейнера `running` (`app`, `postgres`, `redis` — `healthy`), `/test` → `404`, `migrate:status` → 3 строки `Ran`, суммы файлов окружения совпадают с `review-analysis-1.md`.

Уточнения к критериям, учтённые в плане:

- К6: `route:list --path=test` возвращает код 0 и без маршрута (замечание 3 из `review-analysis-1.md`), поэтому проверяется наличие строки, а не код возврата.
- К8: маркер задан — `test-page-ok`.
- К9: после добавления теста ожидается `3 passed` (анализ требовал «не меньше 2»).
- К10: исходные суммы записаны в этом плане, включая файлы `pipeline/001-laravel-docker-setup/`, для которых reviewer их не снимал.
- Вывод `php artisan test` содержит ANSI-коды цвета даже с `-T`, поэтому результат сверяется по `rc=0` и подстроке `3 passed`, а не по точной строке `Tests: 3 passed`.
