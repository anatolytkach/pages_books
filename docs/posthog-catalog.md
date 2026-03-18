# PostHog для каталога reader.pub

Дата актуальности: 2026-03-17

## Что подключено

- `pageview` каталога отправляется при загрузке `/books/`.
- `pageview` reader отправляется при загрузке `/books/reader/`.
- Событие `book_open` отправляется при открытии книги в `/books/reader/`.
- Повторная многократная отправка `book_open` в пределах одной загрузки страницы заблокирована.
- Включен `autocapture`, поэтому PostHog будет автоматически считать клики и другие базовые browser events на каталоге и в reader.
- Ключи и host не захардкожены: они читаются из env Cloudflare Pages / Worker и подставляются в HTML через `_worker.js`.

Важно: в текущем репозитории каталог реализован не на Astro. Здесь статический `catalog/index.html` и `reader/index.html`, поэтому интеграция сделана в фактическую архитектуру проекта: статические страницы + Pages Worker.

Ниже инструкция именно для облачного PostHog, то есть для аккаунта в `app.posthog.com`.

## Какие env нужны

Задайте переменные окружения в Cloudflare Pages для проекта:

- `READERPUB_POSTHOG_ENABLED=true`
- `READERPUB_POSTHOG_KEY=phc_...`
- `READERPUB_POSTHOG_HOST=https://us.i.posthog.com`

Поддерживаются и короткие алиасы:

- `POSTHOG_ENABLED`
- `POSTHOG_KEY`
- `POSTHOG_HOST`

Рекомендуется использовать именно `READERPUB_*`, чтобы не смешивать переменные разных проектов.

## Где взять key и host

В интерфейсе PostHog:

1. Откройте проект в PostHog.
2. Перейдите в `Project settings`.
3. Найдите блок с данными проекта / API keys.
4. Скопируйте:
   - `Project API Key` -> это значение для `READERPUB_POSTHOG_KEY`
   - `API Host` -> это значение для `READERPUB_POSTHOG_HOST`

Обычно host выглядит так:

- US cloud: `https://us.i.posthog.com`
- EU cloud: `https://eu.i.posthog.com`

Если вы регистрируетесь в облачном PostHog, выбирать self-hosted вам не нужно.

## Как запустить

Локально:

1. Поднимите проект как обычно.
2. Убедитесь, что worker получает env-переменные PostHog.
3. Откройте каталог `/books/`.
4. Откройте любую книгу из каталога.

В production:

1. Добавьте env в Cloudflare Pages project settings.
2. Задеплойте проект.
3. Откройте каталог и затем книгу.

## Как открыть PostHog

1. Зайдите в ваш PostHog workspace в `app.posthog.com`.
2. Откройте нужный project.
3. Перейдите в раздел `Activity`, `Events`, `Product analytics`, `Insights` или `Dashboards` в зависимости от нужного отчета.

## Где смотреть pageviews каталога и reader

Есть два простых способа:

### Вариант 1: Activity / Events

1. Откройте `Activity` или `Events`.
2. Отфильтруйте событие `$pageview`.
3. Добавьте фильтр по свойству:
   - `page_type = catalog`

Так вы увидите только pageview каталога, без reader.

Для reader сделайте такой же фильтр, но:

- `page_type = reader`

### Вариант 2: Insight

1. Откройте `Insights`.
2. Создайте `Trends`.
3. Выберите событие `$pageview`.
4. Добавьте фильтр:
   - `page_type = catalog`

Это даст график просмотров каталога по времени.

Для reader сделайте отдельный insight с фильтром:

- `page_type = reader`

Так вы увидите, как растут просмотры страниц книг.

## Где смотреть клики на каталоге и в reader

Так как включен `autocapture`, PostHog будет автоматически собирать клики как browser events.

1. Откройте `Activity` или `Events`.
2. Найдите autocaptured click events.
3. Для каталога добавьте фильтр по URL или path, соответствующий `/books/`.
4. Для reader добавьте фильтр по URL или path, соответствующий `/books/reader/`.

Если вам нужна именно общая динамика активности, а не анализ конкретных элементов интерфейса, этого достаточно.

## Где смотреть `book_open`

1. Откройте `Activity` или `Events`.
2. Найдите событие `book_open`.
3. При открытии конкретного события смотрите свойства:
   - `book_id`
   - `slug`
   - `title`
   - `url`
   - `referrer`

Для тренда:

1. Откройте `Insights`.
2. Создайте `Trends`.
3. Выберите событие `book_open`.

## Как увидеть топ книг по открытиям

Самый простой способ:

1. Откройте `Insights`.
2. Создайте `Trends`.
3. Выберите событие `book_open`.
4. Нажмите `Break down by`.
5. Выберите свойство:
   - `title`
   или
   - `book_id`

Если названия книг вам не важны, этот раздел можно вообще не использовать. Для вашей задачи достаточно pageview и autocaptured clicks.

## Как собрать простой dashboard

Минимальный dashboard под вашу задачу можно собрать так:

1. Создайте insight `Catalog pageviews`:
   - событие `$pageview`
   - фильтр `page_type = catalog`

2. Создайте insight `Reader pageviews`:
   - событие `$pageview`
   - фильтр `page_type = reader`

3. Создайте insight `Book opens`:
   - событие `book_open`

4. Создайте insight по autocaptured clicks:
   - autocaptured click event
   - отдельно для `/books/`
   - отдельно для `/books/reader/`, если хотите раздельные графики

5. Откройте `Dashboards`.
6. Создайте новый dashboard, например `Reader Catalog Growth`.
7. Добавьте туда эти графики.

## Что именно отправляется

### Pageview каталога

Событие:

- `$pageview`

Свойства:

- `page_type = catalog`
- `path`
- `hash`

### Pageview reader

Событие:

- `$pageview`

Свойства:

- `page_type = reader`
- `path`
- `search`

### Открытие книги

Событие:

- `book_open`

Свойства:

- `page_type = reader`
- `book_id`
- `slug`
- `title`
- `url`
- `referrer`

## Техническая схема

1. `_worker.js` читает env.
2. `_worker.js` подставляет значения в `meta[name="posthog-*"]` в HTML.
3. `books/shared/posthog.js` инициализирует PostHog только если env включены.
4. `catalog/index.html` отправляет `$pageview` каталога.
5. `reader/index.html` отправляет `$pageview` reader.
6. `reader/index.html` отправляет `book_open` один раз на загрузку страницы.
7. `books/shared/posthog.js` включает `autocapture`, чтобы собирать клики на каталоге и в reader.
