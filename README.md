# maxprice

MAX-бот для мониторинга закупочных цен в рабочих чатах.

Бот читает сообщения из MAX через webhook и подсвечивает только оперативно важные изменения:

- рост закупочной цены;
- текущая закупочная цена в базе равна `0`.

Снижение закупочной цены игнорируется, потому что в ежедневном потоке оно создает шум и не требует срочной реакции категорийного менеджера.

## Архитектура

```text
MAX chat -> MAX webhook -> Vercel Function -> parser -> report -> MAX message
```

Код хранится в GitHub, исполняется на Vercel. Домен нужен как публичный HTTPS-адрес для webhook.

## Структура

```text
api/max/webhook.ts            основной webhook от MAX
api/max/register-webhook.ts   регистрация webhook в MAX
api/max/test-parse.ts         ручной тест парсера
api/max/debug-chat.ts         отладка chat_id и update
src/config/chats.ts           конфиг рабочих чатов
src/max/client.ts             клиент MAX API
src/max/updateExtractor.ts    извлечение text/chat_id/user_id из update
src/parser/priceParser.ts     парсер роста закупочных цен
src/parser/shops.ts           справочник магазинов и алиасов
src/parser/reportFormatter.ts форматирование отчета
```

## Переменные окружения

Создай переменные в Vercel Project Settings -> Environment Variables.

```env
MAX_BOT_TOKEN=
MAX_WEBHOOK_SECRET=
ADMIN_SECRET=
PUBLIC_WEBHOOK_URL=
TARGET_USER_ID=
TARGET_CHAT_ID=
ADMIN_NOTIFY_UNKNOWN_CHATS=false
CHAT_CONFIGS_JSON=
```

Что значит каждая переменная:

`MAX_BOT_TOKEN` - токен бота MAX. Не публиковать и не отправлять в чаты.

`MAX_WEBHOOK_SECRET` - секрет webhook. MAX будет присылать его в заголовке `X-Max-Bot-Api-Secret`, а проект будет проверять.

`ADMIN_SECRET` - пароль для служебных endpoint: `register-webhook`, `test-parse`, `debug-chat`.

`PUBLIC_WEBHOOK_URL` - полный адрес webhook, например:

```text
https://maxprice.example.ru/api/max/webhook
```

`TARGET_USER_ID` - твой user_id в MAX, если отчеты должны приходить в личку.

`TARGET_CHAT_ID` - id отдельного чата, например `Контроль закупочных цен`. Если задан, приоритет будет у чата.

`CHAT_CONFIGS_JSON` - удобный способ подключать несколько MAX-чатов без правки кода.

## Конфиг чатов

На старте можно держать конфиг в `src/config/chats.ts`, но удобнее через переменную `CHAT_CONFIGS_JSON` в Vercel.

Пример:

```json
{
  "123456789": {
    "name": "Операторы цены",
    "mode": "price_changes",
    "enabled": true,
    "sendTo": "user"
  },
  "987654321": {
    "name": "Возвраты",
    "mode": "returns",
    "enabled": false,
    "sendTo": "user"
  }
}
```

Режимы:

- `price_changes` - мониторинг роста закупочных цен;
- `returns` - заготовка под возвраты;
- `warehouse` - заготовка под РЦ;
- `repricing` - заготовка под переоценку;
- `generic` - общий режим без обработки.

Сейчас рабочий обработчик есть только для `price_changes`.

## Как работает парсер цен

Оператор пишет примерно так:

```text
Баграт
Цена товара: Мак Изд Гранд ди Паста Фузилли Спирали 450г 1/12, (74,29), отличается то текущей закупочной цены - 58,37
Цена товара: Кофе Монарх 3в1 растворим Mild 13.5г 1/24, (10,34), отличается то текущей закупочной цены - 12,61

Светлый
Цена товара: Чай Пример 100г 1/12, (130), отличается от текущей закупочной цены - 100
```

Бот идет по сообщению сверху вниз:

1. Видит `Баграт` и запоминает магазин внутри текущего сообщения.
2. Видит товарную строку.
3. Цена в скобках = цена в накладной.
4. Цена после дефиса = текущая закупочная цена в 1С.
5. Если цена в накладной выше текущей, это рост.
6. Если цена в накладной ниже или равна текущей, строка скрывается.
7. Если текущая цена равна `0`, строка уходит в отдельный блок проверки.
8. Если ниже встречается новый магазин, бот переключается на него.
9. Если магазин в сообщении не указан, бот пишет `магазин не указан`.

## Локальная проверка

```bash
npm install
npm run typecheck
npm test
npm run build
```

Для локального запуска Vercel:

```bash
npm run dev
```

## Тест парсера через API

После деплоя можно проверить парсер без MAX.

```bash
curl -X POST "https://YOUR_DOMAIN/api/max/test-parse" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Баграт\nЦена товара: Мак Изд Гранд ди Паста Фузилли Спирали 450г 1/12, (74,29), отличается то текущей закупочной цены - 58,37\nЦена товара: Кофе Монарх 3в1 растворим Mild 13.5г 1/24, (10,34), отличается то текущей закупочной цены - 12,61"
  }'
```

Ожидание: в ответе будет только рост по макаронам. Кофе скрывается, потому что закуп снизился.

## Регистрация webhook

После деплоя и настройки переменных окружения:

```bash
curl -X POST "https://YOUR_DOMAIN/api/max/register-webhook" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Endpoint возьмет `PUBLIC_WEBHOOK_URL` из переменных окружения и зарегистрирует webhook в MAX.

## Как добавить новый чат

1. Добавь бота в MAX-чат.
2. Включи `ADMIN_NOTIFY_UNKNOWN_CHATS=true`, если хочешь получить уведомление с новым `chat_id`.
3. Либо смотри `chat_id` в логах Vercel.
4. Добавь `chat_id` в `CHAT_CONFIGS_JSON`.
5. Укажи `mode`.
6. Поставь `enabled: true`.
7. Redeploy обычно не нужен, если меняешь только environment variable в Vercel, но после изменения переменных окружения Vercel может потребовать новый deploy.

## Что делать, если бот молчит

Проверь по порядку:

1. Бот добавлен в нужный MAX-чат.
2. Webhook зарегистрирован.
3. `MAX_WEBHOOK_SECRET` совпадает с секретом, который передан в MAX.
4. `MAX_BOT_TOKEN` задан в Vercel.
5. `TARGET_USER_ID` или `TARGET_CHAT_ID` задан.
6. `chat_id` рабочего чата есть в `CHAT_CONFIGS_JSON`.
7. Для этого чата стоит `enabled: true`.
8. Режим чата `price_changes`.
9. В сообщении реально есть рост закупа, а не снижение.
10. В логах Vercel нет ошибки отправки в MAX.

## Как добавить магазин или алиас

Открой `src/parser/shops.ts` и добавь алиас в нужный магазин. Если магазин новый, добавь новую строку в объект `SHOP_ALIASES`.

После изменения запусти:

```bash
npm test
```

## Безопасность

- Не коммить `.env`.
- Не логировать токен бота.
- Не отправлять отчеты в общий чат операторов по умолчанию.
- Не хранить переписку.
- Обрабатывать только текстовые сообщения.
- Вложения игнорируются.
