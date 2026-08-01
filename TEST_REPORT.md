# Test report

Дата проверки: 2026-08-01

Среда: headless Chromium, Python Playwright, локальные файлы без интернета.

Результат: **39 passed, 0 failed**.

Проверены расчётные формулы, удаление прежних бизнес-лимитов, два основания Ticketmaster, календарь, K, hotelling, таблицы, сортировка, MCDA и все 25 Plotly-панелей.

Полный вывод последнего запуска:

```text
PASS  localStorage versioning
PASS  artificial upper limits removed
PASS  default 216 scenarios
PASS  occupancy table has 21 rows
PASS  roundup €0.10
PASS  venue mode a recalculates
PASS  venue mode a formula
PASS  venue mode b recalculates
PASS  venue mode b formula
PASS  venue mode c recalculates
PASS  venue mode c formula
PASS  K=1 recalculates
PASS  K=1 rounded working price
PASS  K=1.25 recalculates
PASS  K=1.25 rounded working price
PASS  empty input preserves last valid result
PASS  empty input shows explicit error
PASS  large value recalculates
PASS  large value not clamped
PASS  manual price rounded before calculations
PASS  values above former maxima recalculate
PASS  former K/hotelling/digital limits removed
PASS  Ticketmaster basis selector
PASS  rehearsal field is truly disabled
PASS  disabled field preserves value
PASS  calendar-day difference ignores DST
PASS  zero-ticket IN-03 message
PASS  zero-ticket charts contain no NaN/Infinity
PASS  hotelling solver detects no finite solution
PASS  K unavailable is explicit
PASS  K unavailable KPI label
PASS  all positive scenarios are shown
PASS  only 12 closest negative scenarios are shown
PASS  column sorting toggles direction
PASS  MCDA 25x5 import parser
PASS  all 25 Plotly panels render
PASS  no chart render errors
PASS  all charts contain no NaN/Infinity
PASS  no JavaScript errors

Result: 39 passed, 0 failed
```
