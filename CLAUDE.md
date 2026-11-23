# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Что это за проект

В репозитории две связанные части:

1. **Конвейер агентов Claude Code** — `.claude/agents/` (orchestrator, analyst, planner, coder, reviewer) и папка `pipeline/` с результатами их работы. Это основной предмет проекта.
2. **Приложение Laravel 13** (PHP 8.4, PostgreSQL 17, Redis 7) в корне — полигон, на котором конвейер выполняет задачи. Сейчас это почти чистый skeleton: маршруты `/` и `/test` в `routes/web.php`, контроллеров и моделей сверх стандартных нет.

Проект в git, удалённый репозиторий — `origin` (GitHub), основная ветка `main`.

Документация, отчёты и общение с пользователем — на русском.

## Команды

PHP и Composer на хосте не используются — всё выполняется в контейнере `app`. Корень проекта смонтирован в `/var/www/html`, правки кода видны сразу без пересборки.

```bash
docker compose up -d --build          # запуск; приложение на http://localhost:8000
docker compose ps -a                  # состояние сервисов (app, queue, postgres, redis)
docker compose down                   # остановка; с -v удаляются данные БД и Redis

docker compose exec -T app php artisan test                          # все тесты
docker compose exec -T app php artisan test --filter=TestPageTest    # один класс или метод
docker compose exec -T app php artisan test tests/Feature/TestPageTest.php
docker compose exec -T app ./vendor/bin/pint                         # форматирование (--test — только проверка)
docker compose exec -T app php artisan migrate:status
docker compose restart queue          # обязательно после изменения кода задач очереди
```

Первый запуск без `vendor/` и `.env` — по инструкции в шапке `compose.yaml` (`cp .env.example .env`, затем `composer install` и `key:generate` через `docker compose run --rm --no-deps app …`).

## Окружение: что неочевидно

- Миграции применяются автоматически при каждом старте сервиса `app` (`migrate --force` в его `command`).
- Сервис `queue` — постоянный воркер `queue:work redis` на том же образе `testagents-app`. Он держит код в памяти, поэтому после правок задач его нужно перезапускать.
- Сессии и очереди — в Redis (с паролем, клиент `phpredis`), кэш — в БД (`CACHE_STORE=database`), на Redis он намеренно не переведён.
- `DB_HOST` и `REDIS_HOST` — имена сервисов compose-сети; порты 5432 и 6379 на хост не опубликованы, достучаться до БД и Redis можно только через `docker compose exec`.
- Тесты не трогают PostgreSQL и Redis: `phpunit.xml` переключает их на SQLite `:memory:`, `sync`-очередь и `array`-сессии.
- Фронтенд — свой CSS без фреймворков, правила в `.claude/rules/ui.md`. Node в образе нет: сборка Vite запускается на хосте (`npm install`, затем `npm run build`), результат — `public/build/`. Шаблоны подключают файлы через `@vite(...)`, поэтому после правок в `resources/css` и `resources/js` нужна пересборка, а без `public/build/manifest.json` страницы и тесты падают. Файлы из `global/` и `views/` попадают во входы сборки автоматически (`vite.config.js`).
- `docker compose down -v` и другие разрушительные команды на рабочем окружении без запроса пользователя не выполнять; проверку чистого старта делать на изолированной копии с другим именем compose-проекта и портом.

## Конвейер

```
задача → analyst → reviewer → planner → reviewer → coder → reviewer → доклад
```

- Конвейер ведёт агент `orchestrator`; он только вызывает остальных и передаёт пути к файлам, сам не анализирует, не планирует и не пишет код.
- На каждую задачу заводится `pipeline/NNN-короткое-имя/`. Агенты обмениваются результатами **только через файлы этой папки**: `task.md` (задача дословно + раздел «Уточнения»), `analysis.md`, `plan.md`, `code-report.md`, `review-<этап>-N.md`, `report.md`.
- Первая строка вердикта reviewer — `VERDICT: PASS` или `VERDICT: FAIL`. `FAIL` допустим только при блокирующем дефекте с доказательством (`файл:строка`, команда с фактическим выводом, цитата, воспроизведение). До трёх попыток на этап, после третьего `FAIL` — остановка и вопрос пользователю.
- Роли жёстко разделены: analyst и planner пишут только свой файл и проект не меняют; coder реализует план без собственных проектных решений и при невыполнимом плане возвращает `STATUS: BLOCKED`; reviewer ничего не исправляет.
- Модель и глубина рассуждений каждого агента задаются полями `model` и `effort` во frontmatter его файла в `.claude/agents/`.
- Файлы прошлых задач в `pipeline/` — журнал; задним числом их не править. `TODO.md` — чеклист задачи 001, не общий список дел.
- Этот файл читают все агенты конвейера: при изменении окружения или правил конвейера обновляй его вместе с `README.md`.
