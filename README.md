# Courier Finance

Автономный трекер курьерских смен: слоты и заказы, фактическое вознаграждение, выплаты и премии, прогноз, история и импорт XLSX/JSON. Основные расчёты работают локально. Сеть используется для получения публичной погоды.

## Технологии и данные

- Android Java host с локальным WebView; интерфейс и расчёты — JavaScript ES modules.
- Версия и Android package задаются в [`app/build.gradle`](app/build.gradle). Текущая transfer-сборка: `ru.courier.finance.transfer`, 1.7.36 / code 50.
- В браузерном preview состояние хранится в `localStorage`. Android сохраняет JSON в SharedPreferences и ведёт совместимую SQLite-базу с поэтапным переключением источника чтения.
- Личные данные не отправляются погодному сервису. Сервер и генеративный ИИ не участвуют в расчётах.

## Разработка и проверки

```sh
npm run dev
npm test
python3 -m unittest discover -s tests -v
```

`npm run dev` запускает `preview.mjs`; он обслуживает те же файлы из `web/`, которые упаковываются в Android APK. Android-сборка и emulator QA выполняются существующим workflow [`.github/workflows/ui-audit.yml`](.github/workflows/ui-audit.yml). Локальная сборка требует Android SDK/build-tools 35.0.0 и Gradle 8.9+. `build.py` сначала очищает `build/` и создаёт новый ключ, если ожидаемый keystore отсутствует; сохраняйте нужные артефакты и проверяйте прежний ключ до запуска.

## Документация

- [Правила разработки](AGENTS.md)
- [Архитектура и решения](docs/ARCHITECTURE.md)
- [Текущий статус и следующий шаг](docs/PROJECT_CONTEXT.md)
- [Приёмочные сценарии](docs/acceptance/)
- [Forecast и импорт](docs/FORECAST_CONTEXT.md)
