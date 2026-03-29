# Документация проекта reader.pub (handover)

Дата актуальности: 2026-03-18

## 1. Назначение проекта

Проект предоставляет:
- каталог книг `https://reader.pub/books/`;
- веб-читалку EPUB `https://reader.pub/books/reader/`;
- API на Cloudflare Worker для индексов каталога, перевода и shared notes;
- конвейер контента `docx -> epub -> unpack -> R2 -> indexes -> Pages`.

## 1.1 Где взять проект (для нового разработчика)

Репозиторий:
- `https://github.com/anatolytkach/pages_books.git`

Клонирование:

```bash
git clone https://github.com/anatolytkach/pages_books.git
cd pages_books
```

## 2. Полная карта Cloudflare Worker'ов

### Worker A: Pages worker проекта `reader-books`

- Исходник: `_worker.js` (деплоится как Pages Functions worker для проекта `reader-books`).
- Назначение:
  - API индексов из R2 (`/books/api/*`);
  - translate API;
  - notes share API;
  - SSR/edge-рендеринг SEO-страниц;
  - роутинг `/books/*` к статике каталога и reader;
  - `ping` и redirect по `book_id`.
- Ключевые routes:
  - `/books/api/*`
  - `/books/api/translate`, `/api/translate`
  - `/books/api/notes-share*`, `/api/notes-share*`
  - `/books/api/ns*`, `/api/ns*`
  - `/books/ping`
  - `/books/<id>`
  - `/book/<slug>`
  - `/book/<slug>/chapter-<n>-<chapter-slug>`
  - `/author/<slug>`
  - `/category/<slug>`
  - `/sitemap.xml`
  - `/sitemaps/*`
  - `/robots.txt`

### Worker B: notes-share proxy (внешний/служебный)

- Исходник: `tools/runtime/notes-share-proxy-worker.js`
- Конфиг: `tools/runtime/notes-share-proxy-worker.wrangler.toml`
- Назначение:
  - отдельный API-шлюз заметок;
  - хранение share payload в KV (`READERPUB_NOTES_SHARE_KV`, ключи `ns:<share_id>`);
  - fallback чтения из legacy `master.reader-books.pages.dev`.
- Routes по конфигу:
  - `reader.pub/books/api/notes-share*`
  - `reader.pub/api/notes-share*`
  - `reader.pub/books/reader/api/notes-share*`
  - а также короткие алиасы `/ns*`.

### Worker C: docs route worker (production docs gateway)

- Исходник: `tools/runtime/docs-route-worker.js`
- Имя деплоя: `readerpub-docs-route`
- Routes:
  - `reader.pub/docs`
  - `reader.pub/docs/*`
- Назначение:
  - Basic Auth для документации;
  - проксирование на `https://master.reader-books.pages.dev/docs/...`.
- Причина выделения:
  - production `reader.pub/docs/*` изначально не попадал в основной `/books*` worker.
- Правило публикации docs:
  - изменения в `docs/README.md` нужно сразу отражать в `deploy/docs/index.html`;
  - после этого нужно запускать `tools/dev/deploy_docs.sh`;
  - скрипт всегда выкатывает docs в Pages-проект `reader-books` на ветку `master`, потому что `staging.reader.pub/docs/` читает docs именно с `master.reader-books.pages.dev/docs/`.

### Worker D: production router для root-routes и R2-backed SEO

- Исходник: `tools/runtime/reader-books-router.js`
- Назначение:
  - production-router для `reader.pub`;
  - проксирование `/books/*`, `/book/*`, `/author/*`, `/category/*`, `/sitemap.xml`, `/sitemaps/*`, `/robots.txt`;
  - прямое чтение R2 binding `BOOKS` для `api/*`, `content/*` и SEO manifests;
  - защита от расхождений между Pages assets и R2 runtime.
- Ключевая идея:
  - Pages bundle содержит только код и frontend assets;
  - SEO data layer живёт в R2;
  - HTML SEO-страниц рендерится on demand в worker и кэшируется на edge.

## 3. Секреты, bindings, переменные

### Основной worker (`_worker.js`)

- `READER_BOOKS` (R2 binding, чтение `api/*`, запись notes-share если включено).
- `READERPUB_GOOGLE_TRANSLATE_API_KEY` или `GOOGLE_TRANSLATE_API_KEY`.
- `READERPUB_GOOGLE_CLIENT_ID` или `GOOGLE_DRIVE_CLIENT_ID`.
- `DOCS_AUTH_USER`, `DOCS_AUTH_PASS` (если docs auth выполняется этим worker).

### Notes proxy worker

- `READERPUB_NOTES_SHARE_KV` (KV namespace).

### Docs route worker

- `DOCS_AUTH_USER`
- `DOCS_AUTH_PASS`

## 4. Структура хранения книг и индексов в R2

Bucket: `reader-books` (по умолчанию).

### Книги

- Префикс: `content/<book_id>/...`
- Пример:
  - `content/77752/META-INF/container.xml`
  - `content/77752/OEBPS/content.opf`
  - `content/77752/OEBPS/...`

### Индексы каталога

- Префикс: `api/...`
- Глобальный слой:
  - `api/letters.json`
  - `api/languages.json`
  - `api/p/<prefix_or_letter>.json`
  - `api/a/<author_key>.json`
  - `api/search/<token3>.json`
- Языковые слои:
  - `api/lang/<lang>/letters.json`
  - `api/lang/<lang>/p/*.json`
  - `api/lang/<lang>/a/*.json`

### Notes share

- В `_worker.js`: `api/notes_shares/<share_id>.json` в R2.
- В `notes-share-proxy-worker`: KV `ns:<share_id>`.

### SEO data layer

- Префикс: `seo/...`
- Структура:
  - `seo/book-shards/*.json`
  - `seo/author-shards/*.json`
  - `seo/category/*.json`
  - `seo/sitemaps/*.json`
  - `seo/version.json`
- Назначение:
  - source-of-truth для SEO-страниц книг, глав, авторов и категорий;
  - sitemap source data;
  - versioned cache namespace для edge caching.

## 4.1 SEO-проект: как устроен SEO-layer

### Цели

SEO-layer добавлен поверх существующего каталога и reader без переписывания `/books/` и без отдельной базы данных.

Он решает две задачи:
1. даёт чистые индексируемые URL для поисковиков;
2. приводит пользователя либо на SEO page, либо дальше в каталог/reader.

### Публичные SEO URL

- Книга: `/book/<slug>`
- Глава: `/book/<slug>/chapter-<n>-<chapter-slug>`
- Автор: `/author/<slug>`
- Категория: `/category/<slug>`
- Sitemap index: `/sitemap.xml`
- Child sitemaps: `/sitemaps/*.xml`
- Robots: `/robots.txt`

### Что рендерится и где

- SEO HTML не предгенерируется в Pages.
- Book, chapter, author и category pages рендерятся on demand в `_worker.js`.
- На production root-routes идут через `tools/runtime/reader-books-router.js`, который прокидывает R2 binding в Pages worker logic.

### Откуда берутся данные

- Контент книги и XHTML глав: `content/<book_id>/...` в R2.
- Каталожные индексы: `api/...` в R2.
- SEO manifests: `seo/...` в R2.

Книга и глава не читают данные из Pages assets:
- manifest lookup идёт по `seo/book-shards/*.json`;
- source XHTML главы читается из `content/<book_id>/...`.

### Как устроены manifests

Book manifest хранит минимум данных, достаточных для SSR:
- `id`, `slug`, `title`
- `authorName`, `authorSlug`
- `categories[]`
- `chapters[]`
- `cover`, `language`
- `description`, `meta_description`
- `raw_description`, `normalized_description`, `description_source`

Category/author manifests хранят облегчённые списки книг, достаточные для SSR списков и внутренних ссылок.

### Description pipeline

Во время SEO build для книги вычисляются:
- `raw_description`
- `normalized_description`
- `meta_description`
- `description_source`

Приоритет источников:
1. metadata description из EPUB;
2. нормализованный fragment из первой осмысленной линейной главы;
3. безопасный fallback `Read "<title>" by <author> on ReaderPub.`

Нормализация удаляет Gutenberg boilerplate, HTML noise, frontmatter и служебные opening fragments.

### Внутренние ссылки и UX

- На SEO book pages ссылка `Open in WeRead` ведёт в существующий flow `/books/<id>/`.
- Category chips на SEO book page ведут не на `/category/<slug>`, а в каталог:
  - `/books/#view=category&category=<slug>`
- При этом SEO category pages `/category/<slug>` остаются отдельными индексируемыми страницами.
- На SEO category page дополнительно есть CTA `Open in Catalog`.

### Sitemap и robots

- `/sitemap.xml` собирается из `seo/sitemaps/index.json`
- child sitemaps берутся из `seo/sitemaps/*.json`
- `robots.txt` разрешает `/book/`, `/author/`, `/category/`, `/sitemaps/`
- `robots.txt` запрещает `/books/reader/` и `/books/api/`

### Cache strategy

- SEO pages отдают `x-reader-seo-version`
- cache key включает version из `seo/version.json`
- при rebuild manifests новый version автоматически создаёт новый namespace edge cache
- HTML остаётся on-demand, но повторные хиты идут через `caches.default`

### Что нельзя ломать при доработках

- `/books/`
- `/books/<id>/`
- `/books/reader/`
- `/category/<slug>` как SEO page
- canonical на SEO routes
- sitemap presence SEO routes

## 5. Структура индексации (форматы файлов)

Источник правды: `tools/catalog/build_lang_indexes.py`.

### `letters.json`

Формат:
```json
{"letters":[{"letter":"A","key":"a","count":123}, {"letter":"#","key":"num","count":5}]}
```

### `p/<node>.json` (prefix browse)

- Для узла буквы:
  - либо `{"authors":[...], "authorCount":N}` (малый набор, `threshold`);
  - либо `{"prefixes":[{"prefix":"ab","count":15}, ...]}`.
- Для узла префикса:
  - `{"authorCount":N, "authors":[...]}` на листе;
  - `{"authorCount":N, "prefixes":[...]}` на промежуточном узле.

`max_prefix` по умолчанию `5`.

### `a/<author_key>.json`

Формат:
```json
{
  "key":"leotolstoy",
  "name":"Tolstoy, Leo",
  "books":[{"id":"123","title":"...","cover":"/books/content/123/OEBPS/cover.jpg"}]
}
```

### `search/<token3>.json`

Смешанный список элементов:
- автор:
```json
{"t":"a","k":"leotolstoy","n":"Tolstoy, Leo","c":42}
```
- книга:
```json
{"id":"123","title":"...","a":"Tolstoy, Leo","k":"leotolstoy","cover":"/books/content/123/OEBPS/cover.jpg"}
```

Токен — первые 3 символа нормализованного слова.

Правила индексирования:
- книги индексируются по значимым словам заголовка, а не только по первым символам полного `title`;
- авторы индексируются по значимым словам `author index name`;
- для книг и авторов применяются stop-words:
  - `the`, `a`, `an`, `and`, `or`, `of`, `to`, `in`, `on`, `for`, `by`;
- для книг дополнительно исключаются service-words:
  - `vol`, `volume`, `no`, `part`, `chapter`;
- один и тот же автор/книга не дублируется внутри одного `search/<token3>.json`.

Языкового search-слоя больше нет:
- поиск всегда идет через глобальные `api/search/<token3>.json`;
- внутриязыковая навигация сохраняется через `api/lang/<lang>/letters.json`, `api/lang/<lang>/p/*.json`, `api/lang/<lang>/a/*.json`.

### `languages.json`

Формат:
```json
{"languages":[{"code":"en","count":12345},{"code":"ru","count":321}]}
```

Сортировка: по убыванию `count`, затем `code`.

## 6. Алгоритм инкрементальной индексации

При `--book-id` (`build_incremental`):
1. Читается `META-INF/container.xml`, затем `content.opf`.
2. Извлекаются `title`, `creator`, `language`, `cover`.
3. Автор определяется по `author_key = slugify(raw_creator)`.
4. Данные автора/книги встраиваются в существующие `a/*.json`.
5. Пересобираются `letters/p/a/search` только затронутых языков + `all`.
6. Обновляется `languages.json`.

## 7. Конвейер контента: DOCX -> EPUB -> R2 -> индексы -> Pages

### 7.1 DOCX -> EPUB

Скрипт: `books/content/make_epub_from_docx.sh`

Делает:
- генерация CSS заголовков из Word (`gen_epub_css_from_docx.py`);
- сборка EPUB3 через `pandoc`;
- нормализация OPF/TOC/lang/footnotes;
- выходной файл `<name>.epub`.

Запуск:
```bash
cd /Volumes/2T/se_ingest/pages_books/books/content
./make_epub_from_docx.sh ru "Название книги" "Имя Автора"
```

Примечание:
- скрипт ожидает ровно один `.docx` в `books/content`;
- после успеха удаляет исходный `.docx` и `cover.jpg`.

### 7.1.1 PDF -> EPUB

Скрипт: `books/content/make_epub_from_pdf.sh`

Назначение:
- конвертация PDF (с текстовым слоем) в reflowable EPUB3;
- очистка служебных PDF-артефактов (headers/footers/page numbers);
- сохранение обложки из `books/content/cover.jpg` (или `$COVER_IMAGE`);
- защита от дублирования страниц картинками (page-layer bitmaps).

Базовый запуск:

```bash
cd /Volumes/2T/se_ingest/pages_books/books/content
./make_epub_from_pdf.sh en "Book Title" "Author Name"
```

Выход:
- рядом с исходным PDF создается одноименный `*.epub`.

Зависимости:
- `pdftohtml`
- `pandoc`
- `python3`
- `perl`
- `zip`, `unzip`

Поддерживаемые env-параметры:
- `NAV_TITLE` (default: `Contents`)
- `COVER_IMAGE` (default: `books/content/cover.jpg`)
- `STRIP_SYNTHETIC_PAGE_IMAGES` (default: `1`)

Примечание:
- скрипт ожидает ровно один `.pdf` в `books/content`;
- после успеха удаляет исходный `.pdf` и `cover.jpg`.

Важно по изображениям:
- в OCR-PDF часто присутствует большой фоновый image-layer страницы;
- при `STRIP_SYNTHETIC_PAGE_IMAGES=1` скрипт удаляет только массовый паттерн таких page-layer картинок, чтобы не получить дубли: «текст + та же страница как картинка»;
- если в PDF реальные иллюстрации не выделены как отдельные объекты (а «запечены» в page-layer), они не могут быть надежно извлечены отдельно без риска вернуть page-duplicates.

### 7.2 Ingest/Upload/Deploy

Скрипты:
- `books/content/epub_unpack.sh`
- `books/content/epub_publish.sh`

Режимы `epub_unpack.sh`:
- `import-all`: взять все `*.epub`, распаковать в новые numeric id, удалить исходные `.epub`.
- `replace <id> [epub_file]`: заменить существующую папку книги `<id>` из EPUB.

Режимы `epub_publish.sh`:
- `upload-ids <id...>`: залить существующие распакованные книги в `content/<id>/...`, обновить индексы, задеплоить Pages.
- `upload-ids <id...> --no-image-upload`: не перезаливать картинки книги в R2; существующие картинки оставить как есть.
- `reindex-ids <id...>`: только переиндексация + upload индексов + Pages deploy.

Ключевые шаги:
1. `epub_unpack.sh`: распаковка EPUB в `books/content/<id>/` (новый id или replace).
2. `epub_publish.sh`: upload `content/<id>/...` в R2 (retry).
3. `build_lang_indexes.py --book-id <id>` для каждого id.
4. Формирование selective списка upload в `api/...`.
5. `tools/dev/deploy_docs.sh` для публикации документации на `staging.reader.pub/docs/`.

## 7.4 Ручной Gutenberg CLI

Автоматический weekly ingest больше не используется. Вместо него проект использует ручной terminal-first pipeline:

- `tools/gutenberg/gutenberg_manual_ingest.py`

Назначение:
- самому определить старший Gutenberg ID в текущей системе;
- начать со следующего номера без ручного `from-id`;
- скачать только preferred EPUB `pg<ID>.epub`;
- залить новые Gutenberg-книги в legacy layout `books/content/<id>/`;
- обновить каталоговые `api/*`;
- обновить `Newest Releases` по окну последних `30` дней, без hard limit по числу книг;
- собрать selective SEO только для новых книг;
- показать прогресс и поддержать `resume` после сбоя.

Bulk upload и cleanup:
- для массовой загрузки `content/*` и `api/*` CLI предпочитает `rclone`, если доступен remote `r2` или явно передан `--rclone-remote`;
- fallback остается прежним: прямой R2 S3 доступ или `wrangler`;
- CLI и updater после rebuild удаляют устаревшие `lang/*/search` локально и на R2, чтобы старая языковая search-схема не возвращалась.

Каноническая модель:
- Gutenberg: `?id=<gutenberg_id>`
- Manual: `?id=<manual_id>&source=manual`
- `source=gutenberg` не является каноническим URL

Основные команды:

```bash
python3 tools/gutenberg/gutenberg_manual_ingest.py status
python3 tools/gutenberg/gutenberg_manual_ingest.py scan
python3 tools/gutenberg/gutenberg_manual_ingest.py run
python3 tools/gutenberg/gutenberg_manual_ingest.py resume
```

Дополнительные runtime flags:

```bash
python3 tools/gutenberg/gutenberg_manual_ingest.py run --rclone-remote r2
python3 tools/gutenberg/gutenberg_manual_ingest.py run --skip-rclone
```

Что они делают:
- `status` — текущий max Gutenberg ID, следующий стартовый ID и состояние текущей сессии.
- `scan` — поиск новых Gutenberg-книг без импорта.
- `run` — полный импорт: книги, индексы, `Newest Releases`, SEO.
- `resume` — продолжение после сбоя.

Пошаговое применение в терминале:
1. Перейти в корень репозитория:
   ```bash
   cd /Volumes/2T/se_ingest/pages_books
   ```
2. Проверить текущее состояние:
   ```bash
   python3 tools/gutenberg/gutenberg_manual_ingest.py status
   ```
3. Безопасно найти новых кандидатов:
   ```bash
   python3 tools/gutenberg/gutenberg_manual_ingest.py scan
   ```
4. При необходимости отдельно проверить наличие preferred EPUB:
   ```bash
   python3 tools/gutenberg/gutenberg_manual_ingest.py scan --verify-epub-on-scan
   ```
5. Если кандидаты найдены и запуск одобрен, выполнить полный импорт:
   ```bash
   python3 tools/gutenberg/gutenberg_manual_ingest.py run
   ```
6. Следить за progress в терминале и в локальном логе:
   - `/tmp/readerpub_gutenberg_runs/<timestamp>-run.log`
7. После успешного завершения снова вызвать:
   ```bash
   python3 tools/gutenberg/gutenberg_manual_ingest.py status
   ```
8. Если run оборвался, продолжать только через:
   ```bash
   python3 tools/gutenberg/gutenberg_manual_ingest.py resume
   ```
9. Если нужно отдельно добрать только SEO:
   ```bash
   python3 tools/gutenberg/gutenberg_manual_ingest.py seo
   ```
10. Если нужно только пересобрать `Newest Releases`:
   ```bash
   python3 tools/gutenberg/gutenberg_manual_ingest.py newest
   ```

Прогресс:
- CLI пишет фазовый progress в терминал;
- локальный лог: `/tmp/readerpub_gutenberg_runs/<timestamp>-<command>.log`;
- state хранится в R2: `system/gutenberg-pipeline/state.json`.

Runtime:
- предпочтительно: `R2_S3_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`;
- bulk-sync: `rclone` remote `r2` или явный `--rclone-remote`;
- fallback: активная `wrangler` session / `CLOUDFLARE_API_TOKEN`.

## 7.5 Gutenberg updater

Скрипт:
- `tools/gutenberg/update_gutenberg_catalog.py`

Назначение:
- weekly/queued ingest новых Gutenberg-книг без ручного `from-id`;
- массовая загрузка контента и каталоговых индексов;
- rebuild `Newest Releases` и selective SEO;
- синхронизация новой схемы индексов без `api/lang/<lang>/search/*`.

Особенности:
- для bulk upload предпочитает `rclone`, если доступен remote `r2`;
- при необходимости можно явно передать `--rclone-remote` или отключить `rclone` через `--skip-rclone`;
- после rebuild удаляет устаревшие `lang/*/search` локально и purge-ит `api/lang/*/search` на R2.

### 7.3 Workflow: безопасный production deploy каталога и читалки

Для изменений только в UI каталога/читалки (`books/`, `reader/`, `_worker.js`) production deploy нужно делать отдельно от контентного конвейера.

Критично:
- production branch у Cloudflare Pages проекта `reader-books` называется `production`, а не `master`;
- ветка `master` в этом проекте создает только preview deploy (`master.reader-books.pages.dev`) и не обновляет `reader.pub/books/*`;
- production router `tools/runtime/reader-books-router.js` проксирует `reader.pub/books/reader/*` в `https://reader-books.pages.dev/reader/*`, поэтому для боевого обновления должен обновиться именно production alias `reader-books.pages.dev`.

Правильный порядок:
1. Все изменения сначала проверять на локальном сайте; не выкатывать их сразу на production без явного подтверждения пользователя после локальной проверки.
2. Собрать минимальный deploy bundle, а не деплоить весь корень репозитория.
3. В bundle включать только:
   - `_worker.js`
   - `books/` без `books/content/`
   - `reader/`
   - `publisher_tasks/` (worker импортирует `./publisher_tasks/service.mjs`)
4. Не включать тяжелые артефакты вроде `reader_seo_indexes/`, иначе Pages может отклонить deploy из-за лимита `25 MiB` на файл.
5. Деплоить Pages project `reader-books` в branch `production` только после явной команды пользователя на production deploy.

Рабочая команда:

```bash
wrangler pages deploy /tmp/readerpub_deploy \
  --project-name reader-books \
  --branch production \
  --commit-dirty=true
```

Проверка после deploy:
1. `wrangler pages deployment list --project-name reader-books`
   - новый deploy должен появиться как `Environment = Production`, `Branch = production`
2. Проверить upstream alias:
   - `https://reader-books.pages.dev/reader/`
3. Проверить боевой URL:
   - `https://reader.pub/books/reader/`

Чего не делать:
- не выкатывать изменения на production автоматически сразу после правок;
- не деплоить UI-изменения в branch `master`, если нужен production;
- не считать, что текущая git-ветка репозитория совпадает с production branch в Cloudflare Pages;
- не деплоить из корня репозитория без проверки состава файлов.

### 7.4 Workflow: git commit и push

Правило для работы в этом проекте:
- все пользовательские команды на коммит нужно выполнять по логике `./commit_logic.sh`;
- `commit_logic.sh` обязан:
  - стадить и код проекта, и документацию, если в ней есть изменения;
  - делать `git commit`;
  - сразу делать `git push` в remote;
- поэтому команда пользователя `комит`/`сделай коммит` для этого проекта означает не только локальный commit, но и отправку коммита в remote;
- если меняется логика коммитов, source-of-truth находится в `commit_logic.sh`, и workflow нужно выравнивать под него, а не наоборот.

Проверка:

```bash
./commit_logic.sh "commit message"
git status --short --branch
```

Ожидаемый результат после успешного push:
- ветка не должна оставаться в состоянии `ahead N`.

## 8. Детали selective upload индексов (важно)

`epub_publish.sh` загружает не весь `reader_lang_indexes`, а минимум нужного:
- всегда: `letters.json`, `languages.json`;
- файлы `a/*`, `search/*`, `lang/*`, где найден нужный `book_id`;
- связанные `p/*` для author keys (включая языковые ветки);
- `lang/<lang>/letters.json` для затронутых языков.
- перед upload выполняется проверка консистентности: каждый затронутый author-файл обязан иметь в selective publish list все соответствующие глобальные `search/<token>.json`, рассчитанные из фамилии автора, author key и названий его книг.

Это уменьшает время деплоя и риск лишних изменений.

## 9. Каталог и reader: что зависит от индексов

Каталог (`catalog/index.html`) требует:
- корректные пути из `catalog/catalog.config.json`;
- наличие `api/letters.json`, `api/p/*`, `api/a/*`, `api/search/*`;
- для language mode: `api/languages.json`, `api/lang/<lang>/*`.

Поиск и длинные списки:
- catalog search работает с minimum query length `3`;
- frontend search делает token-based matching по словам запроса:
  - слова запроса должны матчиться по `startsWith` на слова автора/книги;
  - порядок слов в запросе не важен (`william sha` и `sha william` совпадают одинаково);
  - склеенные запросы без разделителей вроде `williamsha` не считаются валидным multi-word match;
- search results сортируются по алфавиту:
  - сначала authors;
  - затем titles;
- search results рендерятся постранично на frontend по `24` элементов на страницу;
- pager search results показывается и сверху, и снизу списка;
- при перелистывании search results frontend делает мягкий scroll к началу search-блока;
- на author page длинные списки книг раскрываются кнопкой `Show more` по `24` книг за шаг.

### Текущее UI-поведение каталога `/books/`

- Header:
  - desktop search живет в header;
  - на desktop в header находятся меню `Newest`, `Popular`, `By Author`, `By Category`, search и `My Books`;
  - на узких экранах header использует гамбургер-меню для навигации, а search остается отдельной строкой под первой строкой header;
  - mobile hamburger раскрывается на всю ширину и перекрывает search, а не раздвигает layout;
  - при переходе через верхние меню секция скроллится так, чтобы ее заголовок оставался видимым;
  - активный header menu item временно становится черным и некликабельным до следующего ручного scroll.
- Landing layout:
  - hero состоит из CTA-карточки слева и изображения readers справа;
  - блок `Browse by Author` расположен после `Browse by Category`;
  - landing order сейчас такой: `Newest Releases` -> `Popular Titles` -> `Browse by Category` -> `Browse by Author`.
- `Browse by Category`:
  - показывает все категории, без client-side лимита;
  - категории отсортированы по алфавиту;
  - счетчики книг на category chips не показываются.
- `Browse by Author`:
  - собран в одну card-like секцию с закруглением, как `Browse by Category`;
  - внутри секции находятся title, language selector, breadcrumbs и динамический browse content;
  - клики по буквам/префиксам/авторам не должны убирать остальные landing sections;
  - внутренний browse content обновляется локально внутри блока, без перерисовки всей страницы.
- Book sections (`Newest Releases`, `Popular Titles`, author/category listings, search results, `My Books`):
  - используют единый card-style книжных карточек;
  - счетчик `N books` показывается в той же строке, что и заголовок секции, справа;
  - list/grid toggle для каталоговых книжных секций убран;
  - книги показываются постранично по `24` на страницу с pager формата `Showing X-Y of Z`;
  - названия книг в карточках — темно-зеленые, underline только на hover;
  - обложка уменьшена, а текстовый блок справа вертикально центрируется относительно высоты карточки.
- Search UX:
  - при активном query hero и остальные catalog sections скрываются, на экране остаются только search results;
  - очистка query возвращает обычный landing layout;
  - `Browse by Author` не должен исчезать из-за внутренних browse-действий, но при активном search скрывается вместе с остальным landing, кроме header search.
- `My Books` view внутри каталога:
  - открывается из header;
  - скрывает hero и весь `Browse by Author` block;
  - показывает локальный список книг даже если Google Drive integration не настроен;
  - `Back to Catalog` находится в header;
- Catalog open transition:
  - все обычные book-open links внутри каталога используют короткий micro-transition `book-opening` на `180ms` перед переходом в reader;
  - modified clicks (`cmd/ctrl/shift/alt`, middle click, `_blank`) не перехватываются;
  - hero/demo links исключены из этого intercept.

### Entry semantics для входа в reader

- `entry=hero`:
  - используется только для hero/demo preview;
  - не должен считаться реальным пользовательским чтением;
  - не пишет `readerpub:lastid`, `readerpub:lastsource`, `readerpub:lastcfi:<book_id>`;
  - не должен попадать в `My Books` ни локально, ни через Drive sync snapshot.
- `entry=catalog`:
  - добавляется к обычным открытиям книг из общего каталога;
  - именно для него показываются reader onboarding hints.
- `entry=mybooks`:
  - используется для открытий книги из `My Books` в каталоге и из `My Books` внутри reader;
  - onboarding hints для каталожного входа в этом режиме не показываются.

### `Newest Releases`: текущее правило данных

- `Newest Releases` теперь строится по `catalog_added_at` за последние `30` дней;
- hard limit на число книг снят;
- count секции должен отражать все книги, попавшие в это окно;
- rebuild `newest` требует актуального базового `reader_lang_indexes`: если свежие книги есть в pipeline state, но отсутствуют в author indexes, секция будет неполной;
- после мартовской починки 2026-03-29 опубликованный `discover/newest.json` снова содержит полный набор книг из текущего 30-дневного окна.

Reader (`reader/index.html` + `reader/js/*`) требует:
- книгу в `/books/content/<id>/...` с валидным `META-INF/container.xml`.

## 9.1 Как устроена читалка (детально)

Ключевые файлы:
- `reader/index.html`
- `reader/js/reader.js`
- `reader/js/fbreader-ui.js`
- `books/shared/drive-sync.js`

### Поток инициализации

1. `reader/index.html` берет `book_id` из `?id=...` или `#...`.
2. Формирует путь книги: `/books/content/<id>/`.
3. Запускает `ePubReader(bookPath, opts)` (`openAs: "directory"`).
4. Инициализирует UI-слой (`fbreader-ui.js`) и обработчики событий.
5. Восстанавливает позицию чтения (CFI) из localStorage.

### Слои читалки

- EPUB engine:
  - `reader/js/epub.js` (ядро рендеринга EPUB).
- Reader orchestration:
  - `reader/js/reader.js` (навигация, page map, счетчик страниц, жизненный цикл рендеров).
- UI shell:
  - `reader/js/fbreader-ui.js` (верхняя/нижняя панель, меню, TOC/bookmarks overlays, mobile/desktop режимы).
- Sync/Cloud:
  - `books/shared/drive-sync.js` (Google Drive sync для пользовательских данных читалки).

### Состояние и хранение

- Локально:
  - `readerpub:lastid`
  - `readerpub:lastcfi:<book_id>`
  - внутренние ключи для прогресса/настроек/закладок.
- Облачно:
  - синхронизация пользовательского состояния через `drive-sync.js` при наличии client id.

### Onboarding hints в reader

- Reader hint-логика зависит от `entry` query param.
- Текущее поведение:
  - показывать hint только для `entry=catalog`;
  - не показывать для `entry=hero` и `entry=mybooks`.
- Текущий hint:
  - появляется через `1500ms` после открытия книги;
  - расположен в нижней центральной части viewport;
  - на touch-устройствах текст: `Swipe or tap edges to turn the page →`;
  - на desktop текст: `Click on edges to turn the page →`;
  - автоматически скрывается через `4000ms` после появления;
  - исчезает раньше, если пользователь сделал первый реальный page turn.
- Для определения первого реального перелистывания используется существующее navigation событие reader (`rendition.on("relocated", ...)`), причем initial relocation при загрузке книги не считается пользовательским turn.

### Навигация

- Переходы по CFI и по разделам TOC.
- Hash change с numeric id переключает книгу.
- Redirect `/books/<id>` ведет на `/books/reader/#<id>`.

### Page counter и global map

- `reader.js` строит глобальную карту страниц (`_globalPageMap`).
- Есть fallback/guard логика на случай долгой сборки или stale-состояния.
- Тесты: `tests/unit/reader-page-counter.unit.test.mjs`.

### TTS и перевод

- TTS логика: `fbreader-ui.js` (speech synthesis + выделение слова/сегмента, resume/stop).
- Перевод текста: worker endpoint `/books/api/translate` (или `/api/translate`).
- Тесты TTS: `tests/unit/reader-tts.unit.test.mjs`.

### Notes / shared notes

- Создание/чтение shared notes через:
  - `/books/api/notes-share*`, `/api/notes-share*`
  - алиасы `/books/api/ns*`, `/api/ns*`.

### Что критично для стабильности reader

- Доступность `content/<id>/META-INF/container.xml` и OPF-файла.
- Согласованность версий `reader.js`/`fbreader-ui.js`/CSS.
- Доступность worker API (translate/notes) и корректные CORS headers.

## 10. Статистика / PostHog

Для `reader.pub/books/` и `reader.pub/books/reader/` подключен PostHog Cloud.

Важно:
- боевой route `reader.pub/books*` обслуживается отдельным worker `reader-books-router`;
- одного деплоя Pages-проекта `reader-books` недостаточно, если изменения должны сразу появиться на production URL `reader.pub/books/`;
- при изменениях, влияющих на боевой `reader.pub/books*`, нужно учитывать production worker/router слой.

Что считается:
- pageview каталога `/books/`;
- pageview reader `/books/reader/`;
- autocapture кликов в каталоге и в reader;
- событие `book_open` при открытии книги.

Где смотреть:
- `Web analytics` -> путь `/books/` для роста каталога;
- `Web analytics` -> путь `/books/reader/` для роста просмотров страниц книг;
- `Activity` -> autocaptured click events для кликов;
- `Activity` или `Insights` -> `book_open` для факта открытия книги.

Переменные окружения:
- `READERPUB_POSTHOG_ENABLED`
- `READERPUB_POSTHOG_KEY`
- `READERPUB_POSTHOG_HOST`

Подробная инструкция:
- `docs/posthog-catalog.md`

## 11. Проверки после обновления контента

Минимальный smoke:
1. `https://reader.pub/books/` — книга видна в каталоге.
2. `https://reader.pub/books/reader/?id=<id>` — книга открывается.
3. Поиск книги/автора выдаёт новый id.
4. Авторская страница открывает `a/<author_key>.json`.
5. Языковой фильтр работает для языка книги.

## 12. Проверки docs/security

`https://reader.pub/docs/`:
- без auth: `401` + `WWW-Authenticate`.
- с auth: `200`.

Текущий production docs route обслуживается `readerpub-docs-route`.

## 13. Тестирование

- unit: `tests/unit/*.mjs`
- integration: `tests/integration/*.mjs`
- e2e: `tests/e2e/*.mjs`

Для docs-auth добавлены integration-тесты:
- `/docs` без creds -> `401`;
- без настроенных секретов -> `503`;
- с валидным Basic Auth -> `200`.
