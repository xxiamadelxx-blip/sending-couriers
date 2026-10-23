# Android QA 1.7.10

Статус: **PARTIAL**. Проверки ниже относятся к синтетическим данным, Android 35 (x86_64) и подписанному APK `qa/Courier-Finance-1.7.10.apk`. Финансовые данные владельца не использовались.

## Проверенные сценарии

| Проверка | Результат | Доказательство |
|---|---|---|
| Прогноз при чистой установке и пустой истории | PASS: Web Worker завершает подготовку и показывает нехватку рабочих часов | [Android CI](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40038374668), снимок и XML в артефакте |
| Выходной с 0 ₽, два слота одной даты 4 ч/8 заказов/1 200 ₽ и 5 ч/10 заказов/2 000 ₽ | PASS: день содержит 9 ч, 18 заказов, 3 200 ₽ | [Android CI](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40038872718), XML истории и `result.json` |
| Обновление поверх 1.7.8, сохранение данных и темы, отсутствие native crash | PASS в указанном сценарии | [Android CI](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40038872718), logcat и снимки |
| Главная, Период, Прогноз, Настройки, форма на 360 dp; главная на 390 dp в двух темах; форма с клавиатурой | PASS для доступности основных элементов. Снимок Настроек повторно показывает дефект отрисовки заголовка в эмуляторе; причина не установлена | [Android CI](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40040322486), снимки и XML |
| Импорт отчёта над нижней панелью на 360 dp | PASS после второй правки: нижняя граница кнопки 1946, верхняя граница навигации 2042 физических px; зазор 96 px | [Android CI](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40040322486); прежний [FAIL](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40039711197) сохранён для сравнения |
| 130 unit, прогноз 360/390 dp в двух темах и сохранение 14/8; NativeBridge схемы 1–6; APK assets/dex/сертификат | PASS локально для финального кандидата | `npm test`, `tests/model-coverage-ui.test.mjs`, `tests/verify_native.py`, `tests/verify_apk.py` |
| Синтетический XLSX с восьмью листами и частичным RAW | PASS: production `WorkbookReader` прочитал файл; 2 события, 1 пара принятие/доставка, повторное применение не меняет базу | `qa/make_partial_xlsx.py`, `tests/verify_workbook.py`, `web/forecast-import.mjs` |

Финальный кандидат: versionCode 24, versionName и надпись в Настройках 1.7.10; SHA-256 APK `2de029f73a84d4dae608785e36e8ee8992af6a681abf34979c1f38d8b9b73ce4`. Сертификат совпадает с 1.7.8. Android прогон 40040322486 завершился PASS.

## Открытые пункты

- Нативный выбор и повторный импорт XLSX с неполными отметками принятия/доставки ещё не подтверждён. Чтение production Java и применение JS проверены вне Android; сценарий SAF добавлен в CI.
- Восстановление из Android Backup не проверено. Манифест разрешает backup, а правила включают `sharedpref/courier_finance.xml` для cloud backup и device transfer; это проверка конфигурации, не восстановление.
- TalkBack не запускался. Веб-карусель имеет `role=tablist/tab`, `aria-selected` и неактивные панели `inert`; реальный порядок озвучивания остаётся открытым.
- Время записи базы на Android и батарея не измерены. На Node 24 синтетические 730 слотов/365 дней дали медиану 6,7 мс, 1460 слотов/730 дней — 11,4 мс для `syncSlots` + snapshots/evaluations + сериализации; это не показатель WebView/SharedPreferences.
- Полный набор пяти экранов в обеих темах на обеих ширинах не снят. Не устранять непроверенный артефакт Настроек правкой CSS без повторного нативного снимка.

Задача продолжения: [#2 Android QA и рефакторинг](https://github.com/xxiamadelxx-blip/sending-couriers/issues/2). Изменения находятся в [черновом PR #1](https://github.com/xxiamadelxx-blip/sending-couriers/pull/1).
