# Instagram Ad Forecast — Barcelona

Локальный web app для оценки Instagram-рекламы на основе предоставленных замеров Ads Manager.

## Запуск

Откройте `index.html` в современном браузере. Установка и интернет-соединение не требуются.

Для production-размещения загрузите все файлы в одну директорию на HTTPS-сервере. Рекомендуемый CSP указан в `CSP.production.txt`.

## Что изменено в версии 3.0.0

- Facebook полностью удалён.
- У бюджета, срока и радиуса нет верхних ограничений интерфейса или скрытых clamps.
- За пределами измеренных данных применяется контролируемая экстраполяция с diminishing returns.
- После 30 дней применяется плавная fatigue-модель без жёсткого предела срока.
- При высокой частоте применяется smooth saturation penalty.
- Main planning forecast отделён от буквального empirical reproduction.
- Для аудитории доступны Raw, Isotonic и Saturation curves.
- Автоматическое обнаружение выбросов можно отключить; каждую метрику каждой строки можно включить или исключить вручную.
- Точка €50 сохранена, но имеет вес 0.45 в trend fit.
- Возраст 65 и диапазон 65+ разделены.
- Ошибочные возрастные диапазоны больше не исправляются молча.
- Добавлены испанские налоговые режимы, Apple fee, media-spend/total-payment режимы и округление cash-значений вверх до целого евро.
- Добавлены reach, repeat-impression share, CPM, CPV, frequency и saturation factor.
- Добавлен отдельный optional-блок Business outcomes.
- Все графики используют текущую модель, имеют dynamic axes, tooltips, reference lines, uncertainty bands, data tables и PNG/SVG export.
- Добавлены CSV с UTF-8 BOM, настоящий XLSX, JSON import/export, URL sharing и local persistence.
- Код разделён на `data.js`, `model.js`, `charts.js`, `app.js` и `tests.js`.

## Калиброванная зона

Delivery anchors:

- дневной бюджет: €2, €25, €50, €75, €100;
- продолжительность: 1, 15, 30 дней;
- delivery radius rows: 1, 15, 30 км;
- аудитория по радиусу: 1–30 км;
- базовая демография: женщины 18–36.

За пределами этих значений интерфейс показывает статус `Extrapolation`, а uncertainty увеличивается.

## Основные формулы

### Audience saturation

```text
A(r) = L × [1 − exp(−(r/s)^k)]
```

Min:

```text
L = 211402.743
s = 8.378526
k = 0.862818
```

Max:

```text
L = 248646.342
s = 8.372927
k = 0.863133
```

### Budget model

```text
Empirical(B) = piecewise-linear(active anchors)

Planning(B) = 0.92 × Empirical(B)
            + 0.08 × WeightedPowerFit(B)
```

Для anchor €50 blend составляет 0.95 / 0.05. При бюджете выше €100:

```text
F(B) = F(100) × (B/100)^e
```

Показатель `e` ограничивается диапазоном, обеспечивающим sublinear growth.

### Long-duration fatigue

```text
EffectiveExtraDays = 30/f × ln(1 + f × (D−30)/30)
Total(D) = Total(30) + DailyRate30 × EffectiveExtraDays
```

`f = 0.55` для impressions и `f = 0.72` для visits.

### Frequency saturation

```text
S = 1, если FrequencyRaw ≤ 4
S = 1 / [1 + ((FrequencyRaw−4)/11)^0.55], иначе
```

```text
Planning impressions = Raw planning × S
Planning visits = Raw planning × S^0.72
```

### Apple fee и IVA

При введённом media spend и оплате через Instagram iOS:

```text
PreTaxPayment = MediaSpend / 0.70
AppleServiceFee = PreTaxPayment − MediaSpend
```

Режим `Spanish business with valid EU VAT ID` показывает 21% IVA как reverse-charge accounting amount, но не добавляет его к cash payment. Режим `consumer / no VAT ID` добавляет 21% IVA к cash payment. Это плановая модель, а не налоговая консультация.

## Импорт данных

Поддерживаются JSON и CSV. CSV должен содержать столбцы:

```text
radius,budget,duration,min,max,visits
```

Разделитель может быть запятой или точкой с запятой.

## Тесты

В интерфейсе откройте `Данные и формулы` и нажмите `Run self-tests`.

Дополнительный browser smoke test:

```bash
python tests/browser_smoke.py
```

Для него требуется Python Playwright и Chromium.

## Файлы

- `index.html` — структура интерфейса;
- `styles.css` — responsive UI;
- `data.js` — исходные замеры и параметры аудитории;
- `model.js` — расчётная модель и validation;
- `charts.js` — доступные SVG-графики и export;
- `app.js` — состояние, UI, импорт и экспорт;
- `tests.js` — встроенные unit tests;
- `tests/browser_smoke.py` — browser regression test;
- `CSP.production.txt` — рекомендуемый production header.
