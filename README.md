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

`npm run dev` запускает `preview.mjs`; он обслуживает те же файлы из `web/`, которые упаковываются в Android APK. Android-сборка и emulator QA выполняются существующим workflow [`.github/workflows/ui-audit.yml`](.github/workflows/ui-audit.yml). Локальная сборка требует Android SDK/build-tools 35.0.0 и Gradle 8.9+:

```sh
python3 build.py --variant transferRelease --output ../artifacts/Courier-Finance-1.7.36.apk
```

Для обновления transfer-приложения используется существующий сертификат из локальных, исключённых из Git файлов `signing/courier-transfer.jks` и `signing/password.txt`; инструкции и SHA-256 сертификата находятся в [`signing/README.md`](signing/README.md). Если этих файлов нет, сборка останавливается и не создаёт новый ключ. Временные тестовые APK собираются только с явным `--test-signing` и не подходят для обновления установленного приложения.

## Документация

- [Правила разработки](AGENTS.md)
- [Архитектура и решения](docs/ARCHITECTURE.md)
- [Текущий статус и следующий шаг](docs/PROJECT_CONTEXT.md)
- [Инструменты анализа кода](tools/quality/README.md)
- [Приёмочные сценарии](docs/acceptance/)
- [Исторические заметки по прогнозу 1.7.4](docs/FORECAST_CONTEXT.md) (текущий статус — в `docs/PROJECT_CONTEXT.md` и исходном коде)
