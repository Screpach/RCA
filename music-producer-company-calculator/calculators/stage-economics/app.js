(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ROUND_EPS = 1e-9;
  const STORAGE_KEY = 'stage-economics-calculator-v3';
  const LEGACY_STORAGE_KEYS = ['stage-economics-calculator-v1', 'stage-economics-calculator-v2'];
  const STORAGE_VERSION = 3;
  const PRICE_MULTIPLIERS = [0.75, 0.9, 1, 1.1, 1.25, 1.5];
  const K_SCENARIO_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const OCCUPANCIES = [35, 50, 65, 75, 90, 100];
  const FEE_MULTIPLIERS = [0.85, 1, 1.15];
  const PACKAGE_MULTIPLIERS = [1, 1.25];
  const IVA_21 = 0.21;
  const MS_PER_DAY = 86400000;
  const IN03_ALPHA = 0.03025 / 1.06975;
  const IN03_BETA = 1.4641 / 1.06975;
  const IN03_GROWTH = 1 + IN03_ALPHA;

  function localIsoDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateParts(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [year, month, day] = value.split('-').map(Number);
    const utc = Date.UTC(year, month - 1, day);
    const check = new Date(utc);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return { year, month, day, utc, epochDay: Math.floor(utc / MS_PER_DAY) };
  }

  function isoFromEpochDay(epochDay) {
    const date = new Date(epochDay * MS_PER_DAY);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function addCalendarDays(value, days) {
    const parsed = typeof value === 'string' ? parseDateParts(value) : value;
    return parsed ? isoFromEpochDay(parsed.epochDay + days) : null;
  }

  function calendarDayDifference(laterValue, earlierValue) {
    const later = typeof laterValue === 'string' ? parseDateParts(laterValue) : laterValue;
    const earlier = typeof earlierValue === 'string' ? parseDateParts(earlierValue) : earlierValue;
    return later && earlier ? later.epochDay - earlier.epochDay : null;
  }

  function todayIso() { return localIsoDate(new Date()); }

  function formatIsoDate(value) {
    const parsed = parseDateParts(value);
    if (!parsed) return '—';
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(parsed.utc));
  }

  const DEFAULT_CONCERT_DATE = addCalendarDays(todayIso(), 60);

  const DEFAULTS = {
    venueRent: 8500,
    venueMode: 'a',
    seats: 600,
    concertDate: DEFAULT_CONCERT_DATE,
    daysToShow: 60,
    monthlyProrationMethod: '30',
    agencyMonthly: 1800,
    agencyIncludesIva: true,
    digitalDaily: 45,
    digitalIncludesIva: true,
    artistCount: 8,
    artistShowFee: 650,
    rehearsalEnabled: true,
    rehearsalHours: 20,
    rehearsalHourlyFee: 25,
    hotellingEnabled: true,
    hotellingRate: 12,
    ticketIvaRate: 10,
    tmRate: 2.5,
    tmBase: 'net',
    expensePackage: 1000,
    kCoefficient: 1.25,
    useKPrice: true,
    analysisBasePrice: 35,
    scenarioGridMode: 'k',
    baseOccupancy: 75,
    beverageContribution: 2.5,
    tornadoShock: 10,
    autoUpdate: true,
  };

  const INPUT_IDS = Object.keys(DEFAULTS);
  const CHECKBOX_IDS = new Set([
    'agencyIncludesIva', 'digitalIncludesIva', 'rehearsalEnabled',
    'hotellingEnabled', 'useKPrice', 'autoUpdate',
  ]);
  const CATALOG = [
    ['Кривые безубыточности по цене', 'Остаток при изменении цены и фиксированных уровнях загрузки.', 'Точная формульная кривая.', '€0, базовая €35, текущая база, точки безубыточности.', 'Hover, zoom, легенда, PNG.'],
    ['Heatmap запаса финансовой прочности', 'Маржа безопасности для сетки цена × загрузка.', 'Marginal trend не требуется.', '0% маржи, 75% загрузки, текущая база.', 'Hover, zoom, PNG.'],
    ['Tornado чувствительности', 'Изменение остатка при симметричном шоке факторов.', 'Точные пересчёты ± выбранный шок.', 'Базовый результат €0.', 'Слайдер шока, hover, PNG.'],
    ['Heatmap операционного остатка', 'Операционный остаток по цене и загрузке.', 'Marginal means вычисляются отдельно в модуле 20.', '€0, 75%, текущая база.', 'Hover, zoom, PNG.'],
    ['Bruto-перечисление относительно цены', 'Сумма после билетного IVA и Ticketmaster.', 'Точная формула.', 'Диагональ y=x, базовая €35, текущая база.', 'Hover, zoom, PNG.'],
    ['Эффективная IN-03 относительно цены', 'Формульная надбавка на билет и её доля.', 'Точная формула IN-03.', 'Текущая база, медиана.', 'Hover, zoom, PNG.'],
    ['Heatmap доли положительных вариантов', 'Доля положительных комбинаций гонорара и пакета.', 'Эмпирическая доля.', '50% порог, 75% загрузки.', 'Hover, zoom, PNG.'],
    ['Waterfall одного билета', 'Декомпозиция выбранного сценария на билет.', 'Структурный расчёт.', '€0.', 'Клик по scatter меняет сценарий, PNG.'],
    ['Scatter остаток × посещаемость', 'Связь посещаемости и остатка.', 'OLS отдельно по каждой цене с R².', '€0, 98 гостей, выбранный сценарий.', 'Клик по точке, hover, легенда, zoom, PNG.'],
    ['Dot plot рейтинга маржи', 'Сценарии по марже, отсортированные от лучшего.', 'Rolling median.', '0%, P5, медиана, выбранный сценарий.', 'Клик по точке, hover, zoom, PNG.'],
    ['Heatmap пакет расходов × цена', 'Средний остаток по цене и уровню пакета.', 'Отдельная marginal-панель №12.', '€0, текущая цена.', 'Hover, zoom, PNG.'],
    ['Marginal trend пакет × цена', 'Средние остатки рядом с финансовой heatmap.', 'Маргинальные средние.', '€0, текущая цена.', 'Hover, легенда, zoom, PNG.'],
    ['Состав IVA и комиссии по цене', 'Структура одного билета: IVA, TM и перечисление.', 'Точные формулы.', 'TM 2,5%, текущая база.', 'Hover, легенда, PNG.'],
    ['Scatter остаток × прямые расходы', 'Компромисс между расходами и остатком.', 'OLS отдельно по каждой цене с R².', '€0, текущие прямые расходы.', 'Клик по точке, hover, zoom, PNG.'],
    ['Гистограмма остатка с KDE', 'Распределение результатов 216 сценариев.', 'Gaussian KDE, Silverman.', '€0, медиана.', 'Hover, zoom, PNG.'],
    ['ECDF операционного остатка', 'Эмпирическая вероятность результата не выше x.', 'Ступенчатая ECDF.', '€0, 50% порог.', 'Hover, zoom, PNG.'],
    ['Box plot остатка по цене', 'Разброс результатов внутри уровней цены.', 'Линии медиан box plot.', '€0, базовая €35.', 'Hover, zoom, PNG.'],
    ['Box plot остатка по загрузке', 'Разброс результатов внутри уровней загрузки.', 'Линии медиан box plot.', '€0, 75%.', 'Hover, zoom, PNG.'],
    ['Главные эффекты факторов', 'Маргинальное среднее влияние каждого фактора.', 'Маргинальные средние.', 'Общий средний результат.', 'Hover, легенда, PNG.'],
    ['Interaction цена × загрузка', 'Совместное влияние цены и загрузки.', 'Маргинальные средние.', '€0, текущая цена, 75%.', 'Hover, легенда, zoom, PNG.'],
    ['Pareto frontier', 'Недоминируемые решения: ниже расходы, выше остаток.', 'Линия недоминируемых решений.', '€0, текущие прямые расходы.', 'Клик по точке, hover, zoom, PNG.'],
    ['Корреляционная heatmap', 'Линейные связи финансовых показателей.', 'Не применяется методологически.', 'Центр шкалы = 0.', 'Hover, zoom, PNG.'],
    ['Stacked structure расходов', 'Структура события по загрузке.', 'Общие расходы и brutto-выручка.', '75%, 98 гостей, €0.', 'Hover, легенда, PNG.'],
    ['Средний MCDA-ранг', 'Средний ранг по 25 импортированным или резервным наборам.', 'Среднее по 25 прогонам.', 'Top-5, общий средний, выбранный сценарий.', 'Клик по столбцу, hover, PNG.'],
    ['Устойчивость MCDA-ранга', 'Средний ранг против стандартного отклонения по импортированной матрице или proxy.', 'Эмпирическая устойчивость 25 прогонов.', 'Top-5, медиана, выбранный сценарий.', 'Клик по точке, hover, zoom, PNG.'],
  ];

  const app = {
    inputs: null,
    model: null,
    scenarios: [],
    prices: [],
    selectedScenarioId: null,
    chartRenderToken: 0,
    chartVersion: 0,
    chartDirty: new Set(),
    chartRendering: new Set(),
    chartObserver: null,
    lastValidSnapshot: null,
    mcdaConfig: null,
    mcdaMode: 'proxy',
    tableSort: { key: 'operatingBalance', direction: 'desc' },
  };

  function ceil01(value) {
    if (!Number.isFinite(value)) return NaN;
    return Math.ceil((value - ROUND_EPS) * 10) / 10;
  }

  function round2(value) {
    if (!Number.isFinite(value)) return NaN;
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isFiniteNumber(value) { return typeof value === 'number' && Number.isFinite(value); }

  function money(value, digits = 1) {
    if (!isFiniteNumber(value)) return '—';
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value);
  }

  function number(value, digits = 1) {
    if (!isFiniteNumber(value)) return '—';
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value);
  }

  function percent(value, digits = 1) {
    return isFiniteNumber(value) ? `${number(value, digits)}%` : '—';
  }

  function readNumericField(id, label, issues, { min = null, max = null, integer = false, strictlyPositive = false } = {}) {
    const el = $(id);
    const raw = el.value.trim();
    if (raw === '') {
      issues.push({ id, message: `${label}: поле не заполнено.` });
      return NaN;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      issues.push({ id, message: `${label}: требуется конечное число.` });
      return NaN;
    }
    if (integer && !Number.isInteger(value)) issues.push({ id, message: `${label}: требуется целое число.` });
    if (strictlyPositive && value <= 0) issues.push({ id, message: `${label}: значение должно быть больше нуля.` });
    if (min !== null && value < min) issues.push({ id, message: `${label}: значение не может быть меньше ${min}.` });
    if (max !== null && value > max) issues.push({ id, message: `${label}: значение не может превышать ${max}.` });
    return value;
  }

  function readInputs() {
    const issues = [];
    const concertDate = $('concertDate').value.trim();
    if (!parseDateParts(concertDate)) issues.push({ id: 'concertDate', message: 'Дата концерта: выберите корректную календарную дату.' });
    const inputs = {
      venueRent: readNumericField('venueRent', 'Аренда', issues, { min: 0 }),
      venueMode: $('venueMode').value,
      seats: readNumericField('seats', 'Количество мест', issues, { integer: true, strictlyPositive: true }),
      concertDate,
      daysToShow: readNumericField('daysToShow', 'Длительность рекламы', issues, { min: 0, integer: true }),
      monthlyProrationMethod: $('monthlyProrationMethod').value,
      agencyMonthly: readNumericField('agencyMonthly', 'Работа рекламщиков', issues, { min: 0 }),
      agencyIncludesIva: $('agencyIncludesIva').checked,
      digitalDaily: readNumericField('digitalDaily', 'Digital-реклама', issues, { min: 0 }),
      digitalIncludesIva: $('digitalIncludesIva').checked,
      artistCount: readNumericField('artistCount', 'Количество артистов', issues, { min: 0, integer: true }),
      artistShowFee: readNumericField('artistShowFee', 'Гонорар за спектакль', issues, { min: 0 }),
      rehearsalEnabled: $('rehearsalEnabled').checked,
      rehearsalHours: readNumericField('rehearsalHours', 'Часы репетиций', issues, { min: 0 }),
      rehearsalHourlyFee: readNumericField('rehearsalHourlyFee', 'Ставка репетиции', issues, { min: 0 }),
      hotellingEnabled: $('hotellingEnabled').checked,
      hotellingRate: readNumericField('hotellingRate', 'Hotelling', issues, { min: 0 }) / 100,
      ticketIvaRate: readNumericField('ticketIvaRate', 'IVA билета', issues, { min: 0 }) / 100,
      tmRate: readNumericField('tmRate', 'Ticketmaster', issues, { min: 0, max: 99.999999 }) / 100,
      tmBase: $('tmBase').value,
      expensePackage: readNumericField('expensePackage', 'Пакет расходов', issues, { min: 0 }),
      kCoefficient: readNumericField('kCoefficient', 'Коэффициент K', issues, { strictlyPositive: true }),
      useKPrice: $('useKPrice').checked,
      manualAnalysisBasePrice: readNumericField('analysisBasePrice', 'Ручная цена', issues, { min: 0 }),
      analysisBasePrice: NaN,
      scenarioGridMode: $('scenarioGridMode').value,
      baseOccupancy: readNumericField('baseOccupancy', 'Базовая загрузка', issues, { min: 0, max: 100 }),
      beverageContribution: readNumericField('beverageContribution', 'Вклад напитка', issues, { min: 0 }),
      tornadoShock: readNumericField('tornadoShock', 'Tornado-шок', issues, { min: 0, max: 100 }) / 100,
      autoUpdate: $('autoUpdate').checked,
    };
    if (!inputs.rehearsalEnabled) {
      inputs.rehearsalHours = Number.isFinite(inputs.rehearsalHours) ? inputs.rehearsalHours : 0;
      inputs.rehearsalHourlyFee = Number.isFinite(inputs.rehearsalHourlyFee) ? inputs.rehearsalHourlyFee : 0;
      for (let i = issues.length - 1; i >= 0; i -= 1) if (['rehearsalHours', 'rehearsalHourlyFee'].includes(issues[i].id)) issues.splice(i, 1);
    }
    if (!inputs.hotellingEnabled) {
      inputs.hotellingRate = Number.isFinite(inputs.hotellingRate) ? inputs.hotellingRate : 0;
      for (let i = issues.length - 1; i >= 0; i -= 1) if (issues[i].id === 'hotellingRate') issues.splice(i, 1);
    }
    return { inputs, issues };
  }

  function venueGross(inputs) {
    if (inputs.venueMode === 'b') return ceil01(inputs.venueRent * (1 + IVA_21));
    if (inputs.venueMode === 'c') return ceil01((inputs.venueRent / 0.66) * (1 + IVA_21));
    return ceil01(inputs.venueRent);
  }

  function venueModeDetails(inputs) {
    if (inputs.venueMode === 'b') return { label: 'Аренда B: всё включено без IVA', formula: `${money(inputs.venueRent)} × 1,21` };
    if (inputs.venueMode === 'c') return { label: 'Аренда C: только зал без IVA', formula: `${money(inputs.venueRent)} ÷ 0,66 × 1,21` };
    return { label: 'Аренда A: всё включено + IVA 21%', formula: 'Введённая сумма уже является итоговой' };
  }

  function gross21Raw(amount, alreadyIncludes) {
    return alreadyIncludes ? amount : amount * (1 + IVA_21);
  }

  function in03Adjustment(direct) {
    return ceil01((0.03025 * direct + 1.4641) / 1.06975);
  }

  function calendarProrationFactor(inputs) {
    const days = inputs.daysToShow;
    if (inputs.monthlyProrationMethod === '30') return days / 30;
    if (inputs.monthlyProrationMethod === 'average') return days / (365 / 12);
    const end = parseDateParts(inputs.concertDate);
    const startIso = addCalendarDays(inputs.concertDate, -days);
    const start = parseDateParts(startIso);
    if (!start || !end || days === 0) return 0;
    const startMonthIndex = start.year * 12 + (start.month - 1);
    const endMonthIndex = end.year * 12 + (end.month - 1);
    const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (startMonthIndex === endMonthIndex) return days / daysIn(start.year, start.month);
    const nextMonthUtc = Date.UTC(start.month === 12 ? start.year + 1 : start.year, start.month % 12, 1);
    const firstFraction = (Math.floor(nextMonthUtc / MS_PER_DAY) - start.epochDay) / daysIn(start.year, start.month);
    const endMonthStartUtc = Date.UTC(end.year, end.month - 1, 1);
    const lastFraction = (end.epochDay - Math.floor(endMonthStartUtc / MS_PER_DAY)) / daysIn(end.year, end.month);
    const fullMonths = Math.max(0, endMonthIndex - startMonthIndex - 1);
    return firstFraction + fullMonths + lastFraction;
  }

  function baseStateAtHotelling(inputs, fixedBeforeHotelling, hotelling) {
    const direct = fixedBeforeHotelling + hotelling;
    const adjustment = in03Adjustment(direct);
    const finalGross = direct + adjustment;
    const ticketPrice = ceil01(finalGross / inputs.seats);
    const nextHotelling = inputs.hotellingEnabled
      ? ceil01((ticketPrice / (1 + inputs.ticketIvaRate)) * inputs.seats * inputs.hotellingRate)
      : 0;
    return { hotelling, direct, adjustment, finalGross, ticketPrice, nextHotelling };
  }

  function solveBaseHotelling(inputs, fixedBeforeHotelling) {
    if (!inputs.hotellingEnabled || inputs.hotellingRate === 0) {
      const state = baseStateAtHotelling(inputs, fixedBeforeHotelling, 0);
      return { ok: true, ...state, method: 'hotelling отключён', steps: 0, reason: '' };
    }
    const q = inputs.hotellingRate / (1 + inputs.ticketIvaRate);
    const denominator = 1 - q * IN03_GROWTH;
    if (!(denominator > 0)) {
      return {
        ok: false,
        reason: `Конечная цена не существует: ставка hotelling создаёт переменные расходы не меньше роста финального brutto (критический уровень ≈ ${percent((1 + inputs.ticketIvaRate) / IN03_GROWTH * 100, 2)}).`,
        method: 'аналитическая проверка существования', steps: 0,
      };
    }
    const analytical = q * (IN03_GROWTH * fixedBeforeHotelling + IN03_BETA) / denominator;
    let highTicks = Math.max(1, Math.ceil((analytical * 1.25 + inputs.seats * 0.2 + 1) * 10));
    const evaluateTicks = (ticks) => baseStateAtHotelling(inputs, fixedBeforeHotelling, ticks / 10);
    let highState = evaluateTicks(highTicks);
    let expansionSteps = 0;
    while (Number.isFinite(highState.nextHotelling) && highState.nextHotelling > highState.hotelling + 0.05) {
      if (highTicks > Number.MAX_SAFE_INTEGER / 4) {
        return { ok: false, reason: 'Расчёт превышает точность чисел браузера; уменьшите значения или ставку hotelling.', method: 'защищённый решатель', steps: expansionSteps };
      }
      highTicks *= 2;
      highState = evaluateTicks(highTicks);
      expansionSteps += 1;
    }
    if (!Number.isFinite(highState.nextHotelling)) {
      return { ok: false, reason: 'Расчёт hotelling переполнил числовой диапазон браузера.', method: 'защищённый решатель', steps: expansionSteps };
    }
    let lowTicks = 0;
    let binarySteps = 0;
    while (lowTicks < highTicks) {
      const mid = Math.floor((lowTicks + highTicks) / 2);
      const state = evaluateTicks(mid);
      if (state.nextHotelling <= state.hotelling + 0.05) highTicks = mid;
      else lowTicks = mid + 1;
      binarySteps += 1;
    }
    let state = evaluateTicks(lowTicks);
    const seen = new Set();
    let stabilizationSteps = 0;
    while (Math.abs(state.nextHotelling - state.hotelling) >= 0.05) {
      const key = state.hotelling.toFixed(1);
      if (seen.has(key)) {
        return { ok: false, reason: 'Округление €0,10 образует цикл и не даёт устойчивой фиксированной точки hotelling.', method: 'защищённый решатель', steps: expansionSteps + binarySteps + stabilizationSteps };
      }
      seen.add(key);
      state = baseStateAtHotelling(inputs, fixedBeforeHotelling, state.nextHotelling);
      stabilizationSteps += 1;
    }
    return {
      ok: true, ...state, analytical, method: 'аналитическая оценка + дискретный решатель €0,10',
      steps: expansionSteps + binarySteps + stabilizationSteps, reason: '',
    };
  }

  function computeBaseModel(inputs) {
    const venue = venueGross(inputs);
    const agencyMonthlyGrossRaw = gross21Raw(inputs.agencyMonthly, inputs.agencyIncludesIva);
    const agencyIva = inputs.agencyIncludesIva ? agencyMonthlyGrossRaw - agencyMonthlyGrossRaw / (1 + IVA_21) : inputs.agencyMonthly * IVA_21;
    const prorationFactor = calendarProrationFactor(inputs);
    const agencyPeriod = ceil01(agencyMonthlyGrossRaw * prorationFactor);
    const digitalDailyGrossRaw = gross21Raw(inputs.digitalDaily, inputs.digitalIncludesIva);
    const digitalIva = inputs.digitalIncludesIva ? digitalDailyGrossRaw - digitalDailyGrossRaw / (1 + IVA_21) : inputs.digitalDaily * IVA_21;
    const digitalTotal = ceil01(digitalDailyGrossRaw * inputs.daysToShow);
    const marketing = agencyPeriod + digitalTotal;
    const showFees = ceil01(inputs.artistCount * inputs.artistShowFee);
    const rehearsals = inputs.rehearsalEnabled ? ceil01(inputs.artistCount * inputs.rehearsalHourlyFee * inputs.rehearsalHours) : 0;
    const expensePackage = ceil01(inputs.expensePackage);
    const fixedBeforeHotelling = venue + marketing + showFees + rehearsals + expensePackage;
    const derivedValues = [venue, agencyMonthlyGrossRaw, agencyIva, prorationFactor, agencyPeriod, digitalDailyGrossRaw, digitalIva, digitalTotal, marketing, showFees, rehearsals, expensePackage, fixedBeforeHotelling];
    const solution = derivedValues.every(Number.isFinite)
      ? solveBaseHotelling(inputs, fixedBeforeHotelling)
      : { ok: false, reason: 'Расчёт превышает числовой диапазон браузера. Верхнего бизнес-лимита нет, но введённые значения слишком велики для точного вычисления JavaScript.', method: 'проверка числовой точности', steps: 0 };
    const model = {
      valid: solution.ok,
      failureReason: solution.reason || '',
      venue, agencyMonthlyGrossRaw, agencyIva, prorationFactor, agencyPeriod,
      digitalDailyGrossRaw, digitalIva, digitalTotal, marketing, showFees, rehearsals,
      expensePackage, fixedBeforeHotelling,
      hotelling: solution.ok ? solution.hotelling : NaN,
      direct: solution.ok ? solution.direct : NaN,
      adjustment: solution.ok ? solution.adjustment : NaN,
      finalGross: solution.ok ? solution.finalGross : NaN,
      ticketPrice: solution.ok ? solution.ticketPrice : NaN,
      solverMethod: solution.method,
      solverSteps: solution.steps,
      analyticalHotelling: solution.analytical,
    };
    if (solution.ok) {
      const be = findBreakEvenPrice(inputs, model, inputs.baseOccupancy, 1, 1);
      model.dynamicBreakEven = be.price;
      model.dynamicBreakEvenReason = be.reason;
      model.kUnavailableReason = be.price === 0 ? 'K недоступен: цена безубыточности равна €0, поэтому отношение к ней не определено.' : be.reason;
      model.dynamicBreakEvenDetails = be;
    } else {
      model.dynamicBreakEven = null;
      model.dynamicBreakEvenReason = solution.reason;
      model.kUnavailableReason = solution.reason;
      model.dynamicBreakEvenDetails = { price: null, reason: solution.reason };
    }
    return model;
  }

  function ticketmasterBaseAmount(inputs, grossRevenue) {
    return inputs.tmBase === 'gross' ? grossRevenue : grossRevenue / (1 + inputs.ticketIvaRate);
  }

  function scenarioAt(inputs, model, price, occupancy, feeMultiplier = 1, packageMultiplier = 1, overrides = {}) {
    const workingPrice = ceil01(price);
    const targetOccupancy = clamp(occupancy, 0, 100);
    const tickets = Math.max(0, Math.round(inputs.seats * targetOccupancy / 100));
    const actualOccupancy = inputs.seats > 0 ? round2(tickets / inputs.seats * 100) : NaN;
    const venue = ceil01(model.venue * (overrides.venueMultiplier ?? 1));
    const marketing = ceil01(model.marketing * (overrides.marketingMultiplier ?? 1));
    const showFees = ceil01(model.showFees * feeMultiplier * (overrides.artistMultiplier ?? 1));
    const rehearsals = ceil01(model.rehearsals * feeMultiplier * (overrides.rehearsalMultiplier ?? 1));
    const expensePackage = ceil01(model.expensePackage * packageMultiplier * (overrides.packageMultiplier ?? 1));
    const fixedComponents = venue + marketing + showFees + rehearsals + expensePackage;
    const effectiveHotellingRate = inputs.hotellingEnabled ? inputs.hotellingRate * (overrides.hotellingMultiplier ?? 1) : 0;
    const hotelling = ceil01((workingPrice / (1 + inputs.ticketIvaRate)) * tickets * effectiveHotellingRate);
    const adjustmentOnFixed = in03Adjustment(fixedComponents);
    const adjustment = in03Adjustment(fixedComponents + hotelling);
    const variableAdjustment = Math.max(0, round2(adjustment - adjustmentOnFixed));
    const fixedCosts = fixedComponents + adjustmentOnFixed;
    const variableCosts = hotelling + variableAdjustment;
    const directCosts = fixedCosts + variableCosts;
    const grossRevenue = round2(workingPrice * tickets);
    const ticketIva = ceil01(grossRevenue - grossRevenue / (1 + inputs.ticketIvaRate));
    const tmRate = inputs.tmRate * (overrides.tmMultiplier ?? 1);
    const tmCommission = ceil01(ticketmasterBaseAmount(inputs, grossRevenue) * tmRate);
    const remittance = round2(grossRevenue - ticketIva - tmCommission);
    const beverageRevenue = round2(inputs.beverageContribution * (overrides.beverageMultiplier ?? 1) * tickets);
    const netRevenue = round2(remittance + beverageRevenue);
    const operatingBalance = round2(netRevenue - directCosts);
    const margin = netRevenue === 0 ? null : round2(operatingBalance / netRevenue * 100);
    const safetyMargin = grossRevenue === 0 ? null : round2(operatingBalance / grossRevenue * 100);
    return {
      price: workingPrice, occupancy: round2(targetOccupancy), actualOccupancy, tickets,
      feeMultiplier, packageMultiplier, venue, marketing, showFees, rehearsals, expensePackage,
      fixedComponents, hotelling, adjustmentOnFixed, adjustment, variableAdjustment,
      fixedCosts, variableCosts, directCosts, grossRevenue, ticketIva, tmCommission, remittance,
      beverageRevenue, netRevenue, operatingBalance, margin, safetyMargin,
      positive: operatingBalance >= 0,
    };
  }

  function breakEvenAnalyticalEstimate(inputs, model, occupancy, feeMultiplier = 1, packageMultiplier = 1) {
    const tickets = Math.max(0, Math.round(inputs.seats * clamp(occupancy, 0, 100) / 100));
    if (tickets === 0) return { ok: false, reason: 'Невозможно рассчитать при 0 проданных билетов.' };
    const fixedComponents = model.venue + model.marketing + ceil01(model.showFees * feeMultiplier) + ceil01(model.rehearsals * feeMultiplier) + ceil01(model.expensePackage * packageMultiplier);
    const revenueCoefficient = inputs.tmBase === 'gross'
      ? 1 / (1 + inputs.ticketIvaRate) - inputs.tmRate
      : (1 - inputs.tmRate) / (1 + inputs.ticketIvaRate);
    const hotellingCoefficient = inputs.hotellingEnabled ? inputs.hotellingRate / (1 + inputs.ticketIvaRate) : 0;
    const effectiveCoefficient = revenueCoefficient - IN03_GROWTH * hotellingCoefficient;
    if (!(effectiveCoefficient > 0)) {
      return { ok: false, reason: 'Конечная цена безубыточности не существует: IVA, Ticketmaster и hotelling поглощают весь прирост цены.' };
    }
    const numerator = IN03_GROWTH * fixedComponents + IN03_BETA - inputs.beverageContribution * tickets;
    return { ok: true, estimate: Math.max(0, numerator / (tickets * effectiveCoefficient)), tickets, effectiveCoefficient };
  }

  function findBreakEvenPrice(inputs, model, occupancy, feeMultiplier = 1, packageMultiplier = 1) {
    const tickets = Math.max(0, Math.round(inputs.seats * clamp(occupancy, 0, 100) / 100));
    if (tickets === 0) return { price: null, reason: 'Невозможно рассчитать при 0 проданных билетов.', method: 'аналитическая проверка' };
    const atZero = scenarioAt(inputs, model, 0, occupancy, feeMultiplier, packageMultiplier);
    if (atZero.operatingBalance >= 0) return { price: 0, reason: '', method: 'нулевая цена уже покрывает расходы', estimate: 0 };
    const analytical = breakEvenAnalyticalEstimate(inputs, model, occupancy, feeMultiplier, packageMultiplier);
    if (!analytical.ok) return { price: null, reason: analytical.reason, method: 'аналитическая проверка' };
    let highTicks = Math.max(1, Math.ceil((analytical.estimate + 1) * 10));
    let highScenario = scenarioAt(inputs, model, highTicks / 10, occupancy, feeMultiplier, packageMultiplier);
    let expansions = 0;
    while (highScenario.operatingBalance < 0) {
      if (highTicks > Number.MAX_SAFE_INTEGER / 4) {
        return { price: null, reason: 'Цена безубыточности превышает точность чисел браузера.', method: 'защищённый численный решатель', estimate: analytical.estimate };
      }
      highTicks *= 2;
      highScenario = scenarioAt(inputs, model, highTicks / 10, occupancy, feeMultiplier, packageMultiplier);
      if (!Number.isFinite(highScenario.operatingBalance)) {
        return { price: null, reason: 'Расчёт цены безубыточности переполнил числовой диапазон браузера.', method: 'защищённый численный решатель', estimate: analytical.estimate };
      }
      expansions += 1;
    }
    let lowTicks = 0;
    let binarySteps = 0;
    while (lowTicks < highTicks) {
      const mid = Math.floor((lowTicks + highTicks) / 2);
      const scenario = scenarioAt(inputs, model, mid / 10, occupancy, feeMultiplier, packageMultiplier);
      if (scenario.operatingBalance >= 0) highTicks = mid;
      else lowTicks = mid + 1;
      binarySteps += 1;
    }
    return {
      price: lowTicks / 10, reason: '', method: 'аналитическая оценка + дискретный поиск €0,10',
      estimate: analytical.estimate, steps: expansions + binarySteps,
    };
  }

  function selectedKLevels(k) {
    const anchors = [0.5, 0.75, 1, 1.25, 2];
    const levels = [...new Set([...anchors, round2(k)])].sort((a, b) => a - b);
    if (levels.length < 6) levels.splice(levels.length - 1, 0, 1.5);
    if (levels.length > 6) {
      const removable = levels.filter((v) => !anchors.includes(v) && Math.abs(v - k) > 1e-8);
      if (removable.length) levels.splice(levels.indexOf(removable[0]), 1);
      while (levels.length > 6) levels.splice(levels.length - 2, 1);
    }
    return levels;
  }

  function uniquePriceLevels(basePrice) {
    const levels = [];
    PRICE_MULTIPLIERS.forEach((mult) => {
      let candidate = ceil01(basePrice * mult);
      while (levels.includes(candidate)) candidate = ceil01(candidate + 0.1);
      levels.push(candidate);
    });
    return levels;
  }

  function generateScenarios(inputs, model) {
    let prices = [];
    let priceTargets = [];
    if (inputs.scenarioGridMode === 'k') {
      if (!(Number.isFinite(model.dynamicBreakEven) && model.dynamicBreakEven > 0)) return { scenarios: [], prices: [], error: model.kUnavailableReason || model.dynamicBreakEvenReason || 'K недоступен.' };
      const levels = selectedKLevels(inputs.kCoefficient);
      prices = levels.map((k) => ceil01(model.dynamicBreakEven * k));
      priceTargets = levels;
    } else {
      prices = uniquePriceLevels(inputs.analysisBasePrice);
      priceTargets = prices.map((price) => Number.isFinite(model.dynamicBreakEven) && model.dynamicBreakEven > 0 ? round2(price / model.dynamicBreakEven) : null);
    }
    const scenarios = [];
    const breakEvenCache = new Map();
    let counter = 1;
    prices.forEach((price, priceIndex) => {
      for (const occupancy of OCCUPANCIES) {
        for (const feeMultiplier of FEE_MULTIPLIERS) {
          for (const packageMultiplier of PACKAGE_MULTIPLIERS) {
            const key = `${occupancy}|${feeMultiplier}|${packageMultiplier}`;
            if (!breakEvenCache.has(key)) breakEvenCache.set(key, findBreakEvenPrice(inputs, model, occupancy, feeMultiplier, packageMultiplier));
            const be = breakEvenCache.get(key);
            const scenario = scenarioAt(inputs, model, price, occupancy, feeMultiplier, packageMultiplier);
            scenario.id = `P${counter}`;
            scenario.breakEvenPrice = be.price;
            scenario.breakEvenReason = be.reason;
            scenario.k = be.price === null ? null : (be.price === 0 ? null : round2(scenario.price / be.price));
            scenario.targetK = priceTargets[priceIndex];
            scenarios.push(scenario);
            counter += 1;
          }
        }
      }
    });
    attachMcda(scenarios);
    return { scenarios, prices, error: '' };
  }

  function normalize(values, invert = false) {
    const finite = values.filter(Number.isFinite);
    const min = finite.length ? Math.min(...finite) : 0;
    const max = finite.length ? Math.max(...finite) : 1;
    const span = max - min || 1;
    return values.map((value) => {
      const v = Number.isFinite(value) ? value : min;
      const n = (v - min) / span;
      return invert ? 1 - n : n;
    });
  }

  function deterministicMcdaWeights() {
    const base = [0.30, 0.24, 0.16, 0.16, 0.14];
    const runs = [];
    for (let r = 0; r < 25; r += 1) {
      const raw = base.map((w, i) => Math.max(0.03, w * (1 + 0.28 * Math.sin((r + 1) * (i + 2) * 0.73))));
      const total = raw.reduce((a, b) => a + b, 0);
      runs.push(raw.map((w) => w / total));
    }
    return runs;
  }

  const MCDA_WEIGHT_RUNS = deterministicMcdaWeights();

  function normalizedWeightRuns(runs) {
    return runs.map((row) => {
      const total = row.reduce((sum, value) => sum + value, 0);
      return row.map((value) => value / total);
    });
  }

  function attachMcda(scenarios) {
    if (!scenarios.length) return;
    if (app.mcdaConfig?.type === 'ranks') {
      const byId = new Map(app.mcdaConfig.rows.map((row) => [row.id, row.ranks]));
      const complete = scenarios.every((scenario) => byId.has(scenario.id) && byId.get(scenario.id).length === 25);
      if (complete) {
        scenarios.forEach((scenario) => {
          const ranks = byId.get(scenario.id);
          scenario.mcdaMeanRank = round2(mean(ranks));
          scenario.mcdaRankStd = round2(stddev(ranks));
          scenario.mcdaTop5Rate = round2(ranks.filter((rank) => rank <= 5).length / ranks.length * 100);
          scenario.mcdaScore = round2(mean(ranks.map((rank) => 1 / Math.max(1, rank))) * 100);
          scenario.mcdaRanks = [...ranks];
        });
        app.mcdaMode = 'imported-ranks';
        return;
      }
    }

    const importedWeights = app.mcdaConfig?.type === 'weights' ? app.mcdaConfig.runs : null;
    const weightRuns = importedWeights || MCDA_WEIGHT_RUNS;
    app.mcdaMode = importedWeights ? 'imported-weights' : 'proxy';
    const metrics = [
      normalize(scenarios.map((scenario) => scenario.operatingBalance)),
      normalize(scenarios.map((scenario) => scenario.margin)),
      normalize(scenarios.map((scenario) => scenario.tickets)),
      normalize(scenarios.map((scenario) => scenario.safetyMargin)),
      normalize(scenarios.map((scenario) => scenario.directCosts), true),
    ];
    const ranksByScenario = scenarios.map(() => []);
    const scoresByScenario = scenarios.map(() => []);
    normalizedWeightRuns(weightRuns).forEach((weights) => {
      const scored = scenarios.map((scenario, idx) => ({
        idx,
        score: weights.reduce((sum, weight, metricIdx) => sum + weight * metrics[metricIdx][idx], 0),
      })).sort((a, b) => b.score - a.score);
      scored.forEach((item, rankIdx) => {
        ranksByScenario[item.idx].push(rankIdx + 1);
        scoresByScenario[item.idx].push(item.score);
      });
    });
    scenarios.forEach((scenario, idx) => {
      const ranks = ranksByScenario[idx];
      scenario.mcdaMeanRank = round2(mean(ranks));
      scenario.mcdaRankStd = round2(stddev(ranks));
      scenario.mcdaTop5Rate = round2(ranks.filter((rank) => rank <= 5).length / ranks.length * 100);
      scenario.mcdaScore = round2(mean(scoresByScenario[idx]) * 100);
      scenario.mcdaRanks = ranks;
    });
  }

  function mean(values) {
    const finite = values.filter(Number.isFinite);
    return finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : 0;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function stddev(values) {
    const finite = values.filter(Number.isFinite);
    if (finite.length < 2) return 0;
    const m = mean(finite);
    return Math.sqrt(mean(finite.map((v) => (v - m) ** 2)));
  }

  function pearson(x, y) {
    const pairs = x.map((value, index) => [value, y[index]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    if (pairs.length < 2) return 0;
    const xs = pairs.map((pair) => pair[0]);
    const ys = pairs.map((pair) => pair[1]);
    const mx = mean(xs);
    const my = mean(ys);
    const numerator = xs.reduce((sum, value, i) => sum + (value - mx) * (ys[i] - my), 0);
    const denominator = Math.sqrt(
      xs.reduce((sum, value) => sum + (value - mx) ** 2, 0) *
      ys.reduce((sum, value) => sum + (value - my) ** 2, 0),
    );
    return denominator ? numerator / denominator : 0;
  }

  function ols(x, y) {
    const mx = mean(x);
    const my = mean(y);
    const den = x.reduce((sum, v) => sum + (v - mx) ** 2, 0);
    const slope = den ? x.reduce((sum, v, i) => sum + (v - mx) * (y[i] - my), 0) / den : 0;
    const intercept = my - slope * mx;
    const predicted = x.map((v) => slope * v + intercept);
    const ssRes = y.reduce((sum, v, i) => sum + (v - predicted[i]) ** 2, 0);
    const ssTot = y.reduce((sum, v) => sum + (v - my) ** 2, 0);
    const r2 = ssTot ? 1 - ssRes / ssTot : 1;
    return { slope, intercept, r2 };
  }

  function kdeSilverman(values, points = 120) {
    if (values.length < 2) return { x: values, y: values.map(() => 0), bandwidth: 0 };
    const sd = stddev(values);
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)];
    const q3 = sorted[Math.floor((sorted.length - 1) * 0.75)];
    const sigma = Math.min(sd || 1, (q3 - q1) / 1.34 || sd || 1);
    const h = Math.max(0.1, 0.9 * sigma * Math.pow(values.length, -0.2));
    const minX = Math.min(...values) - 3 * h;
    const maxX = Math.max(...values) + 3 * h;
    const x = Array.from({ length: points }, (_, i) => minX + (maxX - minX) * i / (points - 1));
    const inv = 1 / (values.length * h * Math.sqrt(2 * Math.PI));
    const y = x.map((px) => inv * values.reduce((sum, v) => sum + Math.exp(-0.5 * ((px - v) / h) ** 2), 0));
    return { x, y, bandwidth: h };
  }

  function rollingMedian(values, windowSize = 11) {
    const half = Math.floor(windowSize / 2);
    return values.map((_, i) => median(values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1))));
  }

  function basePlotLayout(title, extra = {}) {
    return {
      title: { text: title, font: { size: 13 }, x: 0.02, xanchor: 'left' },
      margin: { l: 62, r: 28, t: 44, b: 56 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#fbfcfd',
      font: { family: 'Inter, system-ui, sans-serif', size: 11, color: '#425160' },
      hoverlabel: { bgcolor: '#102f48', font: { color: '#ffffff' } },
      legend: { orientation: 'h', y: -0.22, x: 0 },
      xaxis: { gridcolor: '#e8edf0', zerolinecolor: '#c3cdd4', automargin: true },
      yaxis: { gridcolor: '#e8edf0', zerolinecolor: '#c3cdd4', automargin: true },
      ...extra,
    };
  }

  const PLOT_CONFIG = {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    toImageButtonOptions: { format: 'png', filename: 'stage-economics', scale: 2 },
  };

  function chartCard(id, title, description, wide = false) {
    const article = document.createElement('article');
    article.className = `chart-card${wide ? ' wide' : ''}`;
    article.dataset.chartId = id;
    article.innerHTML = `
      <div class="chart-meta">
        <h3>${id}. ${title}</h3>
        <p>${description}</p>
      </div>
      <div id="chart-${id}" class="chart" aria-label="${title}"></div>`;
    return article;
  }

  function initChartsGrid() {
    const grid = $('chartsGrid');
    CATALOG.forEach((row, idx) => {
      const wide = [1, 4, 9, 20, 22, 23].includes(idx + 1);
      grid.appendChild(chartCard(idx + 1, row[0], row[1], wide));
    });
    setupChartObserver();
  }

  function initCatalog() {
    $('catalogBody').innerHTML = CATALOG.map((row, idx) => `
      <tr><td>${idx + 1}</td>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');
  }

  function applyDependencies() {
    const setDisabled = (selector, disabled) => {
      document.querySelectorAll(selector).forEach((container) => {
        container.classList.toggle('is-disabled', disabled);
        container.querySelectorAll('input, select, button').forEach((control) => { control.disabled = disabled; });
      });
    };
    setDisabled('.dependency-rehearsal', !$('rehearsalEnabled').checked);
    setDisabled('.dependency-hotelling', !$('hotellingEnabled').checked);
    setDisabled('.dependency-manual-price', $('useKPrice').checked);
    $('tornadoShockOutput').textContent = `${$('tornadoShock').value || '—'}%`;
    const k = Number($('kCoefficient').value);
    $('kCoefficientOutput').textContent = Number.isFinite(k) ? `K = ${number(k, 2)}` : 'K = —';
    $('kStatus').textContent = !Number.isFinite(k) || k <= 0 ? 'K недоступен: введите число больше нуля'
      : k < 1 ? 'Базовая зона: возможен минус'
        : Math.abs(k - 1) < 0.001 ? 'Точка безубыточности'
          : Math.abs(k - 1.25) < 0.026 ? 'Идеальная зона'
            : k < 1.25 ? 'Положительная зона' : 'Повышенная надбавка';
  }

  function showValidationIssues(issues, extraMessages = []) {
    document.querySelectorAll('.field-error').forEach((node) => node.remove());
    document.querySelectorAll('.input-error').forEach((node) => node.classList.remove('input-error'));
    issues.forEach((issue) => {
      const el = $(issue.id);
      if (!el) return;
      el.classList.add('input-error');
      const field = el.closest('.field');
      if (field && !field.querySelector('.field-error')) {
        const message = document.createElement('small');
        message.className = 'field-error';
        message.textContent = issue.message;
        field.appendChild(message);
      }
    });
    const messages = [...issues.map((issue) => issue.message), ...extraMessages.filter(Boolean)];
    const banner = $('validationBanner');
    banner.hidden = messages.length === 0;
    banner.textContent = messages.join(' ');
  }

  function validateInputs(readResult) {
    showValidationIssues(readResult.issues);
    return readResult.issues.length === 0;
  }

  function collectStateValues() {
    const values = {};
    INPUT_IDS.forEach((id) => { values[id] = CHECKBOX_IDS.has(id) ? $(id).checked : $(id).value; });
    return values;
  }

  function applyStateValues(values) {
    if (!values || typeof values !== 'object') return;
    INPUT_IDS.forEach((id) => {
      if (!(id in values) || !$(id)) return;
      if (CHECKBOX_IDS.has(id)) $(id).checked = Boolean(values[id]);
      else $(id).value = values[id];
    });
  }

  function saveState() {
    const payload = {
      version: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      values: collectStateValues(),
      mcdaConfig: app.mcdaConfig,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (_) { /* storage may be blocked */ }
  }

  function loadState() {
    let payload = null;
    try { payload = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { payload = null; }
    if (payload?.version === STORAGE_VERSION && payload.values) {
      applyStateValues(payload.values);
      app.mcdaConfig = payload.mcdaConfig || null;
      return;
    }
    for (const key of LEGACY_STORAGE_KEYS) {
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem(key)); } catch (_) { legacy = null; }
      if (legacy) {
        applyStateValues(legacy.values || legacy);
        return;
      }
    }
  }

  function resetState() {
    applyStateValues(DEFAULTS);
    applyDependencies();
    recalculate(true);
  }

  function clearAllSavedData() {
    if (!window.confirm('Удалить все сохранённые параметры и импортированную MCDA-матрицу?')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch (_) { /* storage may be blocked */ }
    app.mcdaConfig = null;
    applyStateValues(DEFAULTS);
    applyDependencies();
    recalculate(true);
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportProject() {
    const payload = {
      format: 'stage-economics-project', version: STORAGE_VERSION, exportedAt: new Date().toISOString(),
      values: collectStateValues(), mcdaConfig: app.mcdaConfig,
    };
    downloadBlob(JSON.stringify(payload, null, 2), 'stage-economics-project.json', 'application/json;charset=utf-8');
  }

  async function importProjectFile(file) {
    const text = await file.text();
    let payload;
    try { payload = JSON.parse(text); } catch (_) { throw new Error('Файл проекта не является корректным JSON.'); }
    if (payload?.format !== 'stage-economics-project' || !payload.values) throw new Error('Неизвестный формат проекта.');
    applyStateValues(payload.values);
    app.mcdaConfig = payload.mcdaConfig || null;
    applyDependencies();
    recalculate(true);
  }

  function validateWeightRuns(runs) {
    return Array.isArray(runs) && runs.length === 25 && runs.every((row) =>
      Array.isArray(row) && row.length === 5 && row.every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)
      && row.reduce((sum, value) => sum + Number(value), 0) > 0);
  }

  function validateRankRows(rows) {
    return Array.isArray(rows) && rows.length > 0 && rows.every((row) =>
      typeof row.id === 'string' && /^P\d+$/.test(row.id) && Array.isArray(row.ranks) && row.ranks.length === 25
      && row.ranks.every((value) => Number.isFinite(Number(value)) && Number(value) > 0));
  }

  function parseMcdaText(text, filename = '') {
    if (filename.toLowerCase().endsWith('.json') || text.trim().startsWith('{')) {
      let data;
      try { data = JSON.parse(text); } catch (_) { throw new Error('MCDA JSON повреждён.'); }
      if (data.type === 'weights' && validateWeightRuns(data.runs)) return { type: 'weights', runs: data.runs.map((row) => row.map(Number)), sourceName: filename };
      if (data.type === 'ranks' && validateRankRows(data.rows)) return { type: 'ranks', rows: data.rows.map((row) => ({ id: row.id, ranks: row.ranks.map(Number) })), sourceName: filename };
      throw new Error('MCDA JSON должен содержать 25×5 weights или строки сценариев с 25 ranks.');
    }
    const delimiter = text.includes(';') ? ';' : text.includes('\t') ? '\t' : ',';
    const rows = text.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(delimiter).map((token) => Number(token.trim().replace(',', '.'))));
    if (!validateWeightRuns(rows)) throw new Error('CSV MCDA должен содержать ровно 25 строк × 5 неотрицательных весов.');
    return { type: 'weights', runs: rows, sourceName: filename };
  }

  async function importMcdaFile(file) {
    const config = parseMcdaText(await file.text(), file.name);
    if (config.type === 'ranks' && app.scenarios.length) {
      const importedIds = new Set(config.rows.map((row) => row.id));
      const missing = app.scenarios.filter((scenario) => !importedIds.has(scenario.id)).map((scenario) => scenario.id);
      if (missing.length) throw new Error(`Матрица ranks неполная: отсутствуют ${missing.length} сценариев, начиная с ${missing.slice(0, 5).join(', ')}.`);
    }
    app.mcdaConfig = config;
    recalculate(true);
  }

  function clearMcda() {
    app.mcdaConfig = null;
    recalculate(true);
  }

  function renderMcdaStatus() {
    const status = $('mcdaStatus');
    const note = $('mcdaMethodNote');
    if (app.mcdaMode === 'imported-weights') {
      status.textContent = `Используется импортированная матрица весов 25×5${app.mcdaConfig?.sourceName ? `: ${app.mcdaConfig.sourceName}` : ''}.`;
      note.innerHTML = '<strong>MCDA:</strong> панели используют импортированные 25 прогонов весов по пяти критериям.';
    } else if (app.mcdaMode === 'imported-ranks') {
      status.textContent = `Используются импортированные 25 рангов для каждого сценария${app.mcdaConfig?.sourceName ? `: ${app.mcdaConfig.sourceName}` : ''}.`;
      note.innerHTML = '<strong>MCDA:</strong> панели используют импортированные исходные ранги без пересчёта весов.';
    } else {
      status.textContent = 'Используется резервный proxy: 25 детерминированных прогонов по 5 критериям.';
      note.innerHTML = '<strong>MCDA:</strong> исходная матрица не загружена. Используется явно обозначенный резервный proxy; он не выдаётся за исходный рейтинг.';
    }
  }

  function nearestScenario(scenarios, inputs) {
    if (!scenarios.length) return null;
    return scenarios.reduce((best, scenario) => {
      const distance = Math.abs(scenario.price - inputs.analysisBasePrice) / Math.max(1, inputs.analysisBasePrice)
        + Math.abs(scenario.occupancy - inputs.baseOccupancy) / 100
        + Math.abs(scenario.feeMultiplier - 1)
        + Math.abs(scenario.packageMultiplier - 1);
      return !best || distance < best.distance ? { scenario, distance } : best;
    }, null).scenario;
  }

  function selectedScenario() {
    return app.scenarios.find((scenario) => scenario.id === app.selectedScenarioId) || app.scenarios[0] || null;
  }

  function renderDateSummary() {
    const concertIso = app.inputs.concertDate;
    const campaignStartIso = addCalendarDays(concertIso, -app.inputs.daysToShow);
    const daysUntil = calendarDayDifference(concertIso, todayIso());
    const daysFromStart = calendarDayDifference(todayIso(), campaignStartIso);
    $('campaignStartDate').textContent = formatIsoDate(campaignStartIso);
    $('campaignWarning').textContent = '';
    if (daysUntil < 0) {
      $('concertCountdown').textContent = `Концерт прошёл ${Math.abs(daysUntil)} дн. назад`;
      $('campaignDurationMeta').textContent = `Полная кампания: ${number(app.inputs.daysToShow, 0)} дн. · осталось: 0 дн.`;
      $('campaignWarning').textContent = 'Дата концерта находится в прошлом; календарный расчёт бюджета сохранён, но кампания завершена.';
    } else {
      const remaining = daysFromStart < 0 ? app.inputs.daysToShow : Math.max(0, daysUntil);
      $('concertCountdown').textContent = `До концерта ${daysUntil} дн.`;
      $('campaignDurationMeta').textContent = `Полная кампания: ${number(app.inputs.daysToShow, 0)} дн. · осталось: ${number(remaining, 0)} дн.`;
      if (daysFromStart > 0) $('campaignWarning').textContent = `Плановый старт рекламы прошёл ${daysFromStart} дн. назад.`;
    }
  }

  function prorationLabel(method) {
    if (method === 'average') return '365 / 12';
    if (method === 'calendar') return 'фактические месяцы';
    return '30 дней';
  }

  function renderRateDetails() {
    const { inputs, model } = app;
    $('agencyRateDetails').innerHTML = `Введено: <strong>${money(inputs.agencyMonthly)}</strong> / мес. · IVA: <strong>${money(model.agencyIva, 2)}</strong> · с IVA: <strong>${money(model.agencyMonthlyGrossRaw, 2)}</strong> · период: <strong>${money(model.agencyPeriod)}</strong> (${prorationLabel(inputs.monthlyProrationMethod)}, коэффициент ${number(model.prorationFactor, 4)})`;
    $('digitalRateDetails').innerHTML = `Введено: <strong>${money(inputs.digitalDaily)}</strong> / день · IVA: <strong>${money(model.digitalIva, 2)}</strong> · с IVA: <strong>${money(model.digitalDailyGrossRaw, 2)}</strong> · за ${number(inputs.daysToShow, 0)} дн.: <strong>${money(model.digitalTotal)}</strong>`;
  }

  function renderSummary() {
    const { inputs, model } = app;
    renderDateSummary();
    renderRateDetails();
    const perSeat = (value) => inputs.seats > 0 && Number.isFinite(value) ? ceil01(value / inputs.seats) : NaN;
    $('kpiTicketPrice').textContent = money(model.ticketPrice);
    $('kpiFinalGross').textContent = money(model.finalGross);
    $('kpiVenueGross').textContent = money(model.venue);
    $('kpiVenuePerSeat').textContent = `${money(perSeat(model.venue))} / место`;
    $('kpiMarketing').textContent = money(model.marketing);
    $('kpiMarketingPerSeat').textContent = `${money(perSeat(model.marketing))} / место`;
    $('kpiHotelling').textContent = money(model.hotelling);
    $('kpiHotellingPerSeat').textContent = `${money(perSeat(model.hotelling))} / место · при полной вместимости`;
    $('kpiDynamicBreakEven').textContent = Number.isFinite(model.dynamicBreakEven) ? money(model.dynamicBreakEven) : 'K недоступен';
    $('kpiDynamicBreakEvenMeta').textContent = Number.isFinite(model.dynamicBreakEven)
      ? `при ${number(inputs.baseOccupancy, 1)}% загрузки, IVA ${percent(inputs.ticketIvaRate * 100)}, TM ${percent(inputs.tmRate * 100)}`
      : model.dynamicBreakEvenReason;
    $('kpiKPrice').textContent = money(inputs.kPrice);
    const actualManualK = Number.isFinite(model.dynamicBreakEven) && model.dynamicBreakEven > 0 && Number.isFinite(inputs.analysisBasePrice)
      ? round2(inputs.analysisBasePrice / model.dynamicBreakEven) : null;
    $('kpiKPriceMeta').textContent = inputs.useKPrice
      ? (Number.isFinite(inputs.kPrice) ? `Целевой K ${number(inputs.kCoefficient, 2)} · рабочая цена ${money(inputs.analysisBasePrice)}` : `${model.kUnavailableReason || `K недоступен: ${model.dynamicBreakEvenReason}`}`)
      : `Целевой K ${number(inputs.kCoefficient, 2)} · фактический K ${number(actualManualK, 2)}`;
    $('kPricePreview').textContent = money(inputs.kPrice);
    $('effectivePriceMeta').textContent = inputs.useKPrice
      ? (Number.isFinite(inputs.kPrice) ? 'используется в сценариях' : (model.kUnavailableReason || 'не используется: нет конечной цены безубыточности'))
      : `ручная цена ${money(inputs.analysisBasePrice)} · фактический K ${number(actualManualK, 2)}`;
    $('iterationStatus').textContent = model.valid
      ? `Hotelling: ${model.solverMethod} · ${model.solverSteps} шаг.`
      : `Hotelling: решения нет — ${model.failureReason}`;

    const venueDetails = venueModeDetails(inputs);
    const rows = [
      [`${venueDetails.label}<small class="row-detail">${venueDetails.formula}</small>`, model.venue],
      [`Агентство за ${number(inputs.daysToShow, 0)} дн.`, model.agencyPeriod],
      [`Digital за ${number(inputs.daysToShow, 0)} дн.`, model.digitalTotal],
      ['Гонорары за спектакль', model.showFees],
      ['Репетиции', model.rehearsals],
      ['Дополнительный пакет расходов', model.expensePackage],
      [`Hotelling ${percent(inputs.hotellingRate * 100)} · при полной вместимости`, model.hotelling],
      ['Формульная надбавка IN-03', model.adjustment],
    ];
    $('costBreakdownBody').innerHTML = rows.map(([label, value]) => `
      <tr><td>${label}</td><td class="numeric">${money(value)}</td><td class="numeric">${money(perSeat(value))}</td></tr>`).join('');
    $('costBreakdownFoot').innerHTML = `
      <tr><td>Финальный brutto</td><td class="numeric">${money(model.finalGross)}</td><td class="numeric">${money(model.ticketPrice)}</td></tr>`;
    $('formulaDetails').innerHTML = [
      ['Direct до IN-03', money(model.direct)],
      ['IN-03', money(model.adjustment)],
      ['Финальный brutto', money(model.finalGross)],
      ['Вместимость', `${number(inputs.seats, 0)} мест`],
      ['Hotelling в сценариях', 'по фактически проданным билетам'],
      ['Ticketmaster', inputs.tmBase === 'gross' ? 'от brutto-цены' : 'от цены без IVA'],
      ['Округление', 'каждый оплачиваемый компонент один раз вверх до €0,10'],
    ].map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join('');
  }

  function populateFilters(prices) {
    const currentPrice = $('filterPrice').value;
    const currentOcc = $('filterOccupancy').value;
    $('filterPrice').innerHTML = '<option value="all">Все</option>' + prices.map((p) => `<option value="${p}">${money(p)}</option>`).join('');
    $('filterOccupancy').innerHTML = '<option value="all">Все</option>' + OCCUPANCIES.map((o) => `<option value="${o}">${o}%</option>`).join('');
    if ([...$('filterPrice').options].some((o) => o.value === currentPrice)) $('filterPrice').value = currentPrice;
    if ([...$('filterOccupancy').options].some((o) => o.value === currentOcc)) $('filterOccupancy').value = currentOcc;
  }

  function filteredScenarioBase() {
    const price = $('filterPrice').value;
    const occupancy = $('filterOccupancy').value;
    const result = $('filterResult').value;
    const id = $('filterId').value.trim().toLowerCase();
    const matched = app.scenarios.filter((scenario) => {
      if (price !== 'all' && scenario.price !== Number(price)) return false;
      if (occupancy !== 'all' && scenario.occupancy !== Number(occupancy)) return false;
      if (id && !scenario.id.toLowerCase().includes(id)) return false;
      return true;
    });
    const positives = matched.filter((scenario) => scenario.positive);
    const closestNegatives = matched.filter((scenario) => !scenario.positive)
      .sort((a, b) => b.operatingBalance - a.operatingBalance).slice(0, 12);
    if (result === 'positive') return positives;
    if (result === 'negative') return closestNegatives;
    return [...positives, ...closestNegatives];
  }

  function sortValue(scenario, key) {
    if (key === 'id') return Number(scenario.id.slice(1));
    const value = scenario[key];
    return Number.isFinite(value) ? value : null;
  }

  function sortScenarios(scenarios) {
    const { key, direction } = app.tableSort;
    const multiplier = direction === 'asc' ? 1 : -1;
    return [...scenarios].sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av === bv) return Number(a.id.slice(1)) - Number(b.id.slice(1));
      return (av - bv) * multiplier;
    });
  }

  function filteredScenarios() {
    return sortScenarios(filteredScenarioBase());
  }

  function updateSortUi() {
    const labels = {
      id: 'ID', price: 'цена', targetK: 'K сетки', k: 'K', occupancy: 'загрузка', tickets: 'гости', feeMultiplier: 'гонорар',
      packageMultiplier: 'пакет', directCosts: 'прямые расходы', grossRevenue: 'brutto-выручка',
      operatingBalance: 'остаток', margin: 'маржа', mcdaMeanRank: 'MCDA',
    };
    document.querySelectorAll('.sort-button').forEach((button) => {
      const active = button.dataset.sort === app.tableSort.key;
      button.classList.toggle('active', active);
      button.classList.toggle('asc', active && app.tableSort.direction === 'asc');
      const th = button.closest('th');
      if (th) th.setAttribute('aria-sort', active ? (app.tableSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    });
    $('sortStatus').textContent = `Сортировка: ${labels[app.tableSort.key] || app.tableSort.key} ${app.tableSort.direction === 'asc' ? '↑' : '↓'}`;
  }

  function setScenarioSort(key) {
    if (app.tableSort.key === key) app.tableSort.direction = app.tableSort.direction === 'asc' ? 'desc' : 'asc';
    else {
      app.tableSort.key = key;
      app.tableSort.direction = ['id', 'price', 'targetK', 'k', 'occupancy', 'tickets', 'feeMultiplier', 'packageMultiplier', 'directCosts', 'grossRevenue', 'operatingBalance', 'margin'].includes(key) ? 'desc' : 'asc';
    }
    renderTable();
  }

  function renderTable() {
    const scenarios = filteredScenarios();
    const positivesShown = scenarios.filter((scenario) => scenario.positive).length;
    const negativesShown = scenarios.length - positivesShown;
    $('scenarioCount').textContent = app.scenarios.length
      ? `Показано ${positivesShown} прибыльных + ${negativesShown} ближайших убыточных из ${app.scenarios.length}`
      : 'Сценарии недоступны: требуется конечная рабочая цена и валидная сетка.';
    const selected = selectedScenario();
    $('selectedScenarioLabel').textContent = selected
      ? `Текущий сценарий: ${selected.id} · ${money(selected.price)} · ${percent(selected.occupancy, 0)} · остаток ${money(selected.operatingBalance)}`
      : 'Текущий сценарий: —';
    updateSortUi();
    $('scenarioTableBody').innerHTML = scenarios.map((scenario) => `
      <tr data-scenario-id="${scenario.id}" class="${scenario.id === app.selectedScenarioId ? 'selected ' : ''}${scenario.positive ? 'positive' : 'negative'}">
        <td><strong>${scenario.id}</strong></td>
        <td class="numeric">${money(scenario.price)}</td>
        <td class="numeric">${number(scenario.targetK, 2)}</td>
        <td class="numeric" title="${scenario.breakEvenReason || `BE ${money(scenario.breakEvenPrice)}`}">${number(scenario.k, 2)}</td>
        <td class="numeric">${percent(scenario.occupancy, 0)}</td>
        <td class="numeric">${number(scenario.tickets, 0)}</td>
        <td class="numeric">${number(scenario.feeMultiplier, 2)}</td>
        <td class="numeric">${number(scenario.packageMultiplier, 2)}</td>
        <td class="numeric">${money(scenario.directCosts)}</td>
        <td class="numeric">${money(scenario.grossRevenue)}</td>
        <td class="numeric balance">${money(scenario.operatingBalance)}</td>
        <td class="numeric">${percent(scenario.margin)}</td>
        <td class="numeric">${number(scenario.mcdaMeanRank, 1)}</td>
      </tr>`).join('');
    document.querySelectorAll('#scenarioTableBody tr').forEach((row) => {
      row.addEventListener('click', () => selectScenario(row.dataset.scenarioId, true));
    });
  }

  function occupancyRows() {
    if (!Number.isFinite(app.inputs.analysisBasePrice) || !app.model.valid) return [];
    const rows = [];
    const price = app.inputs.analysisBasePrice;
    for (let targetOccupancy = 0; targetOccupancy <= 100; targetOccupancy += 5) {
      const scenario = scenarioAt(app.inputs, app.model, price, targetOccupancy, 1, 1);
      const be = findBreakEvenPrice(app.inputs, app.model, targetOccupancy, 1, 1);
      scenario.breakEvenPrice = be.price;
      scenario.breakEvenReason = be.reason;
      scenario.k = be.price && be.price > 0 ? round2(price / be.price) : null;
      scenario.targetOccupancy = targetOccupancy;
      rows.push(scenario);
    }
    let crossingMarked = false;
    rows.forEach((row, index) => {
      const previous = index > 0 ? rows[index - 1] : null;
      row.isBreakEvenRow = !crossingMarked && row.positive && (!previous || !previous.positive);
      if (row.isBreakEvenRow) crossingMarked = true;
    });
    return rows;
  }

  function renderOccupancyTable() {
    const rows = occupancyRows();
    const baseK = Number.isFinite(app.model.dynamicBreakEven) && app.model.dynamicBreakEven > 0
      ? round2(app.inputs.analysisBasePrice / app.model.dynamicBreakEven) : null;
    $('occupancyTablePrice').textContent = `Рабочая цена: ${money(app.inputs.analysisBasePrice)} · целевой K ${number(app.inputs.kCoefficient, 2)} · фактический K базы ${number(baseK, 2)}`;
    $('occupancyTableBody').innerHTML = rows.map((scenario) => `
      <tr class="${scenario.positive ? 'positive' : 'negative'}${scenario.isBreakEvenRow ? ' break-even-row' : ''}">
        <td class="numeric"><strong>${percent(scenario.targetOccupancy, 0)}</strong>${scenario.isBreakEvenRow ? '<span class="break-even-label">точка BE</span>' : ''}</td>
        <td class="numeric">${percent(scenario.actualOccupancy, 2)}</td>
        <td class="numeric">${number(scenario.tickets, 0)}</td>
        <td class="numeric">${money(scenario.price)}</td>
        <td class="numeric" title="${scenario.breakEvenReason || ''}">${number(scenario.k, 2)}</td>
        <td class="numeric">${money(scenario.grossRevenue)}</td>
        <td class="numeric">${money(scenario.ticketIva)}</td>
        <td class="numeric">${money(scenario.tmCommission)}</td>
        <td class="numeric" title="По фактически проданным билетам">${money(scenario.hotelling)}</td>
        <td class="numeric">${money(scenario.fixedCosts)}</td>
        <td class="numeric">${money(scenario.variableCosts)}</td>
        <td class="numeric">${money(scenario.directCosts)}</td>
        <td class="numeric">${money(scenario.netRevenue)}</td>
        <td class="numeric balance">${money(scenario.operatingBalance)}</td>
        <td class="numeric">${percent(scenario.margin)}</td>
      </tr>`).join('');
  }

  function csvValue(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function projectMetadataRows() {
    const start = addCalendarDays(app.inputs.concertDate, -app.inputs.daysToShow);
    const venueDetails = venueModeDetails(app.inputs);
    return [
      ['Дата концерта', app.inputs.concertDate], ['Старт рекламы', start], ['Дней рекламы', app.inputs.daysToShow],
      ['Метод месячной ставки', prorationLabel(app.inputs.monthlyProrationMethod)], ['Аренда режим', venueDetails.label],
      ['Аренда итог с IVA', app.model.venue], ['Мест', app.inputs.seats], ['Агентство период', app.model.agencyPeriod],
      ['Digital период', app.model.digitalTotal], ['Маркетинг всего', app.model.marketing], ['Артисты', app.inputs.artistCount],
      ['Гонорары спектакль', app.model.showFees], ['Репетиции', app.model.rehearsals], ['Пакет расходов', app.model.expensePackage],
      ['Hotelling %', app.inputs.hotellingRate * 100], ['Ticketmaster %', app.inputs.tmRate * 100],
      ['Основа Ticketmaster', app.inputs.tmBase === 'gross' ? 'brutto' : 'без IVA'], ['IVA билета %', app.inputs.ticketIvaRate * 100],
      ['Рабочая цена', app.inputs.analysisBasePrice], ['Целевой K', app.inputs.kCoefficient], ['Сетка сценариев', app.inputs.scenarioGridMode],
    ];
  }

  function downloadOccupancyCsv() {
    const lines = ['Параметр;Значение'];
    projectMetadataRows().forEach((row) => lines.push(row.map(csvValue).join(';')));
    lines.push('');
    const headers = ['Целевая_загрузка_%', 'Фактическая_загрузка_%', 'Продано_мест', 'Цена_билета', 'K_факт', 'Выручка_brutto', 'IVA', 'Ticketmaster', 'Hotelling', 'Фиксированные_расходы', 'Переменные_расходы', 'Все_расходы', 'Netto_выручка', 'Остаток', 'Маржа_%'];
    lines.push(headers.join(';'));
    occupancyRows().forEach((scenario) => {
      lines.push([
        scenario.targetOccupancy, scenario.actualOccupancy, scenario.tickets, scenario.price, scenario.k ?? '', scenario.grossRevenue,
        scenario.ticketIva, scenario.tmCommission, scenario.hotelling, scenario.fixedCosts, scenario.variableCosts,
        scenario.directCosts, scenario.netRevenue, scenario.operatingBalance, scenario.margin ?? '',
      ].map(csvValue).join(';'));
    });
    downloadBlob(`\ufeff${lines.join('\n')}`, 'stage-economics-occupancy-0-100.csv', 'text/csv;charset=utf-8');
  }

  function renderRecommendations() {
    if (!app.model?.valid) {
      $('recommendationCards').innerHTML = `<article class="recommendation-card"><span>Рекомендации недоступны</span><strong>—</strong><small>${app.model?.failureReason || 'Нет валидной модели.'}</small></article>`;
      return;
    }
    const levels = [50, 65, 75, 90, 100];
    $('recommendationCards').innerHTML = levels.map((occupancy) => {
      const be = findBreakEvenPrice(app.inputs, app.model, occupancy, 1, 1);
      const kPrice = be.price === null ? null : ceil01(be.price * app.inputs.kCoefficient);
      const guests = Math.round(app.inputs.seats * occupancy / 100);
      return `<article class="recommendation-card">
        <span>${occupancy}% · ${number(guests, 0)} гостей</span>
        <strong>${money(kPrice)}</strong>
        <small>${be.price === null ? be.reason : `BE ${money(be.price)} × K ${number(app.inputs.kCoefficient, 2)}`}</small>
      </article>`;
    }).join('');
  }

  function selectScenario(id, rerenderCharts = false) {
    if (!app.scenarios.some((scenario) => scenario.id === id)) return;
    app.selectedScenarioId = id;
    renderTable();
    if (rerenderCharts) renderCharts();
  }

  function scenarioCsvRows(scenarios) {
    const headers = ['ID', 'Цена', 'K_цель_сетки', 'K_факт', 'Загрузка_%', 'Фактическая_загрузка_%', 'Гостей', 'Гонорар_множитель', 'Пакет_множитель', 'Фиксированные_расходы', 'Переменные_расходы', 'Прямые_расходы', 'Выручка_brutto', 'IVA_билета', 'Ticketmaster', 'Перечисление', 'Напитки', 'Операционный_остаток', 'Маржа_%', 'Запас_%', 'MCDA_средний_ранг', 'MCDA_std', 'MCDA_Top5_%'];
    const lines = [headers.join(';')];
    scenarios.forEach((scenario) => lines.push([
      scenario.id, scenario.price, scenario.targetK ?? '', scenario.k ?? '', scenario.occupancy, scenario.actualOccupancy,
      scenario.tickets, scenario.feeMultiplier, scenario.packageMultiplier, scenario.fixedCosts, scenario.variableCosts,
      scenario.directCosts, scenario.grossRevenue, scenario.ticketIva, scenario.tmCommission, scenario.remittance,
      scenario.beverageRevenue, scenario.operatingBalance, scenario.margin ?? '', scenario.safetyMargin ?? '',
      scenario.mcdaMeanRank, scenario.mcdaRankStd, scenario.mcdaTop5Rate,
    ].map(csvValue).join(';')));
    return lines;
  }

  function downloadScenarioCsv(mode = 'current') {
    const scenarios = mode === 'all' ? app.scenarios : filteredScenarios();
    const lines = ['Параметр;Значение'];
    projectMetadataRows().forEach((row) => lines.push(row.map(csvValue).join(';')));
    lines.push('', ...scenarioCsvRows(scenarios));
    downloadBlob(`\ufeff${lines.join('\n')}`, mode === 'all' ? 'stage-economics-all-scenarios.csv' : 'stage-economics-current-selection.csv', 'text/csv;charset=utf-8');
  }

  function sanitizePlotValue(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map(sanitizePlotValue);
    if (value && typeof value === 'object') {
      const copy = {};
      Object.entries(value).forEach(([key, item]) => { copy[key] = sanitizePlotValue(item); });
      return copy;
    }
    return value;
  }

  function plot(id, traces, layout) {
    const div = $(`chart-${id}`);
    if (!window.Plotly) {
      div.innerHTML = '<div class="plotly-missing">Plotly не загружен. Проверьте наличие файла plotly.min.js рядом с index.html.</div>';
      return Promise.resolve();
    }
    const safeTraces = sanitizePlotValue(traces);
    const safeLayout = sanitizePlotValue(layout);
    div.dataset.hasNonFinite = JSON.stringify(safeTraces).includes('Infinity') || JSON.stringify(safeTraces).includes('NaN') ? 'true' : 'false';
    return Plotly.react(div, safeTraces, safeLayout, PLOT_CONFIG);
  }

  function messagePlot(id, title, message) {
    return plot(id, [], basePlotLayout(title, {
      xaxis: { visible: false }, yaxis: { visible: false }, showlegend: false,
      annotations: [{ x: 0.5, y: 0.5, xref: 'paper', yref: 'paper', text: message, showarrow: false, align: 'center', font: { size: 14 } }],
    }));
  }

  function addClickSelection(chartId) {
    const div = $(`chart-${chartId}`);
    if (typeof div.removeAllListeners === 'function') div.removeAllListeners('plotly_click');
    div.on('plotly_click', (event) => {
      const point = event.points?.[0];
      const id = Array.isArray(point?.customdata) ? point.customdata[0] : point?.customdata;
      if (typeof id === 'string' && /^P\d+$/.test(id)) selectScenario(id, true);
    });
  }

  function zeroLine(axis = 'y', value = 0, dash = 'dash') {
    return axis === 'y'
      ? { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: value, y1: value, line: { color: '#a73939', width: 1.2, dash } }
      : { type: 'line', yref: 'paper', y0: 0, y1: 1, x0: value, x1: value, line: { color: '#7a8791', width: 1.1, dash } };
  }

  function selectedMarkerTrace(xKey, yKey, name = 'Выбранный') {
    const s = selectedScenario();
    return {
      type: 'scatter', mode: 'markers', name,
      x: [s[xKey]], y: [s[yKey]], customdata: [s.id],
      marker: { size: 15, symbol: 'diamond', color: '#d35400', line: { width: 2, color: '#ffffff' } },
      hovertemplate: `${s.id}<br>%{x}<br>%{y}<extra></extra>`,
    };
  }

  function renderChart1() {
    const { inputs, model } = app;
    const referenceValues = [model.ticketPrice, inputs.analysisBasePrice, model.dynamicBreakEven].filter(Number.isFinite);
    const center = Math.max(0.1, ...referenceValues);
    const minPrice = Math.max(0, Math.min(...referenceValues) * 0.55);
    const maxPrice = Math.max(center * 1.75, minPrice + 1);
    const xs = Array.from({ length: 80 }, (_, i) => ceil01(minPrice + (maxPrice - minPrice) * i / 79));
    const occupancies = [50, 75, 100];
    const traces = occupancies.map((occupancy) => ({
      type: 'scatter', mode: 'lines', name: `${occupancy}%`,
      x: xs, y: xs.map((price) => scenarioAt(inputs, model, price, occupancy).operatingBalance),
      hovertemplate: `Цена %{x:.1f} €<br>Остаток %{y:.1f} €<extra>${occupancy}%</extra>`,
    }));
    occupancies.forEach((occupancy) => {
      const be = findBreakEvenPrice(inputs, model, occupancy);
      if (be.price !== null) traces.push({
        type: 'scatter', mode: 'markers', name: `BE ${occupancy}%`, x: [be.price], y: [0],
        marker: { size: 9, symbol: 'x' }, hovertemplate: `${occupancy}%: %{x:.1f} €<extra></extra>`,
      });
    });
    return plot(1, traces, basePlotLayout('Операционный остаток по цене', {
      xaxis: { title: 'Финальная цена билета, €', gridcolor: '#e8edf0' },
      yaxis: { title: 'Операционный остаток, €', gridcolor: '#e8edf0' },
      shapes: [zeroLine('y'), zeroLine('x', 35, 'dot'), zeroLine('x', inputs.analysisBasePrice, 'dashdot')],
      annotations: [
        { x: 35, y: 1, xref: 'x', yref: 'paper', text: '€35', showarrow: false, yanchor: 'bottom' },
        { x: inputs.analysisBasePrice, y: 0, xref: 'x', yref: 'paper', text: 'текущая база', showarrow: false, yanchor: 'top' },
      ],
    }));
  }

  function baselineMatrix(metric) {
    const z = OCCUPANCIES.map((occ) => app.prices.map((price) => scenarioAt(app.inputs, app.model, price, occ, 1, 1)[metric]));
    return z;
  }

  function renderChart2() {
    const z = baselineMatrix('safetyMargin');
    return plot(2, [
      {
        type: 'heatmap', x: app.prices, y: OCCUPANCIES, z,
        colorscale: 'RdYlGn', zmid: 0, colorbar: { title: '%' },
        hovertemplate: 'Цена %{x:.1f} €<br>Загрузка %{y}%<br>Запас %{z:.1f}%<extra></extra>',
      },
      {
        type: 'contour', x: app.prices, y: OCCUPANCIES, z, showscale: false, hoverinfo: 'skip',
        contours: { start: 0, end: 0, size: 1, coloring: 'none', showlabels: true },
        line: { color: '#17242b', width: 2 }, name: '0% маржи',
      },
    ], basePlotLayout('Запас финансовой прочности', {
      xaxis: { title: 'Цена, €' }, yaxis: { title: 'Загрузка, %' },
      shapes: [zeroLine('y', 75, 'dash'), zeroLine('x', app.inputs.analysisBasePrice, 'dashdot')],
    }));
  }

  function renderChart3() {
    const base = selectedScenario();
    const shock = app.inputs.tornadoShock;
    const factors = [
      ['Цена',
        () => scenarioAt(app.inputs, app.model, base.price * (1 - shock), base.occupancy, base.feeMultiplier, base.packageMultiplier),
        () => scenarioAt(app.inputs, app.model, base.price * (1 + shock), base.occupancy, base.feeMultiplier, base.packageMultiplier)],
      ['Загрузка',
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy * (1 - shock), base.feeMultiplier, base.packageMultiplier),
        () => scenarioAt(app.inputs, app.model, base.price, Math.min(100, base.occupancy * (1 + shock)), base.feeMultiplier, base.packageMultiplier)],
      ['Аренда',
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { venueMultiplier: 1 - shock }),
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { venueMultiplier: 1 + shock })],
      ['Маркетинг',
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { marketingMultiplier: 1 - shock }),
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { marketingMultiplier: 1 + shock })],
      ['Гонорар',
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { artistMultiplier: 1 - shock }),
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { artistMultiplier: 1 + shock })],
      ['Репетиции',
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { rehearsalMultiplier: 1 - shock }),
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { rehearsalMultiplier: 1 + shock })],
      ['Hotelling',
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { hotellingMultiplier: 1 - shock }),
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { hotellingMultiplier: 1 + shock })],
      ['Ticketmaster',
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { tmMultiplier: 1 - shock }),
        () => scenarioAt(app.inputs, app.model, base.price, base.occupancy, base.feeMultiplier, base.packageMultiplier, { tmMultiplier: 1 + shock })],
    ].map(([label, lowFn, highFn]) => ({
      label,
      low: lowFn().operatingBalance - base.operatingBalance,
      high: highFn().operatingBalance - base.operatingBalance,
    })).sort((a, b) => Math.max(Math.abs(b.low), Math.abs(b.high)) - Math.max(Math.abs(a.low), Math.abs(a.high)));

    return plot(3, [
      { type: 'bar', orientation: 'h', name: `−${percent(shock * 100, 0)}`, y: factors.map((f) => f.label), x: factors.map((f) => f.low), hovertemplate: '%{y}<br>Δ %{x:.1f} €<extra></extra>' },
      { type: 'bar', orientation: 'h', name: `+${percent(shock * 100, 0)}`, y: factors.map((f) => f.label), x: factors.map((f) => f.high), hovertemplate: '%{y}<br>Δ %{x:.1f} €<extra></extra>' },
    ], basePlotLayout(`Tornado: шок ${percent(shock * 100, 0)}`, {
      barmode: 'overlay', xaxis: { title: 'Изменение операционного остатка, €' },
      yaxis: { autorange: 'reversed' }, shapes: [zeroLine('x')],
    }));
  }

  function renderChart4() {
    const z = baselineMatrix('operatingBalance');
    return plot(4, [
      {
        type: 'heatmap', x: app.prices, y: OCCUPANCIES, z,
        colorscale: 'RdYlGn', zmid: 0, colorbar: { title: '€' },
        hovertemplate: 'Цена %{x:.1f} €<br>Загрузка %{y}%<br>Остаток %{z:.1f} €<extra></extra>',
      },
      {
        type: 'contour', x: app.prices, y: OCCUPANCIES, z, showscale: false, hoverinfo: 'skip',
        contours: { start: 0, end: 0, size: 1, coloring: 'none', showlabels: true },
        line: { color: '#17242b', width: 2 }, name: 'Остаток €0',
      },
    ], basePlotLayout('Операционный остаток: цена × загрузка', {
      xaxis: { title: 'Цена, €' }, yaxis: { title: 'Загрузка, %' },
      shapes: [zeroLine('y', 75, 'dash'), zeroLine('x', app.inputs.analysisBasePrice, 'dashdot')],
    }));
  }

  function priceSweep() {
    const values = [app.model.dynamicBreakEven, app.inputs.analysisBasePrice, app.model.ticketPrice].filter(Number.isFinite);
    const max = Math.max(1, ...values) * 1.8;
    return Array.from({ length: 90 }, (_, i) => ceil01((max * i) / 89));
  }

  function renderChart5() {
    const xs = priceSweep();
    const remittance = xs.map((price) => {
      const iva = price - price / (1 + app.inputs.ticketIvaRate);
      const tmBase = app.inputs.tmBase === 'gross' ? price : price / (1 + app.inputs.ticketIvaRate);
      return price - iva - tmBase * app.inputs.tmRate;
    });
    return plot(5, [
      { type: 'scatter', mode: 'lines', name: 'Перечисление', x: xs, y: remittance, hovertemplate: 'Цена %{x:.1f} €<br>Перечисление %{y:.2f} €<extra></extra>' },
      { type: 'scatter', mode: 'lines', name: 'Без комиссии y=x', x: xs, y: xs, line: { dash: 'dot' }, hoverinfo: 'skip' },
    ], basePlotLayout('Bruto-перечисление на билет', {
      xaxis: { title: 'Финальная цена, €' }, yaxis: { title: 'После IVA и TM, €' },
      shapes: [zeroLine('x', 35, 'dot'), zeroLine('x', app.inputs.analysisBasePrice, 'dashdot')],
      annotations: [{ x: 1, y: 1.08, xref: 'paper', yref: 'paper', xanchor: 'right', showarrow: false, text: `TM от ${app.inputs.tmBase === 'gross' ? 'brutto' : 'цены без IVA'}` }],
    }));
  }

  function renderChart6() {
    const xs = priceSweep();
    const occupancy = app.inputs.baseOccupancy;
    const data = xs.map((price) => scenarioAt(app.inputs, app.model, price, occupancy));
    if (data.every((scenario) => scenario.tickets === 0)) {
      return messagePlot(6, 'Эффективная IN-03', 'Невозможно рассчитать при 0 проданных билетов. Увеличьте вместимость или базовую загрузку.');
    }
    const perTicket = data.map((scenario) => scenario.tickets > 0 ? scenario.adjustment / scenario.tickets : null);
    const share = data.map((scenario) => scenario.directCosts > 0 ? scenario.adjustment / scenario.directCosts * 100 : null);
    return plot(6, [
      { type: 'scatter', mode: 'lines', name: 'IN-03 / билет, €', x: xs, y: perTicket, hovertemplate: 'Цена %{x:.1f} €<br>IN-03 %{y:.3f} €<extra></extra>' },
      { type: 'scatter', mode: 'lines', name: 'IN-03 / расходы, %', x: xs, y: share, yaxis: 'y2', line: { dash: 'dash' }, hovertemplate: 'Цена %{x:.1f} €<br>Доля %{y:.2f}%<extra></extra>' },
    ], basePlotLayout('Эффективная IN-03', {
      xaxis: { title: 'Финальная цена, €' }, yaxis: { title: '€ на билет' },
      yaxis2: { title: '% расходов', overlaying: 'y', side: 'right', showgrid: false },
      shapes: [zeroLine('x', app.inputs.analysisBasePrice, 'dashdot')],
    }));
  }

  function renderChart7() {
    const z = OCCUPANCIES.map((occupancy) => app.prices.map((price) => {
      const group = app.scenarios.filter((scenario) => scenario.price === price && scenario.occupancy === occupancy);
      return group.length ? group.filter((scenario) => scenario.positive).length / group.length * 100 : null;
    }));
    return plot(7, [
      {
        type: 'heatmap', x: app.prices, y: OCCUPANCIES, z, zmin: 0, zmax: 100,
        colorscale: 'RdYlGn', colorbar: { title: '%' },
        hovertemplate: 'Цена %{x:.1f} €<br>Загрузка %{y}%<br>Положительных %{z:.1f}%<extra></extra>',
      },
      {
        type: 'contour', x: app.prices, y: OCCUPANCIES, z, showscale: false, hoverinfo: 'skip',
        contours: { start: 50, end: 50, size: 1, coloring: 'none', showlabels: true },
        line: { color: '#17242b', width: 2 }, name: 'Порог 50%',
      },
    ], basePlotLayout('Доля положительных вариантов', {
      xaxis: { title: 'Цена, €' }, yaxis: { title: 'Загрузка, %' },
      shapes: [zeroLine('y', 75, 'dash')],
    }));
  }

  function renderChart8() {
    const scenario = selectedScenario();
    if (!scenario || scenario.tickets === 0) {
      return messagePlot(8, 'Waterfall одного билета', 'Невозможно рассчитать при 0 проданных билетов. Выберите сценарий с посещаемостью больше нуля.');
    }
    const tickets = scenario.tickets;
    const labels = ['Цена brutto', 'IVA билета', 'Ticketmaster', 'Аренда', 'Маркетинг', 'Артисты', 'Репетиции', 'Пакет', 'Hotelling', 'IN-03', 'Напиток', 'Остаток'];
    const values = [
      scenario.price, -scenario.ticketIva / tickets, -scenario.tmCommission / tickets, -scenario.venue / tickets,
      -scenario.marketing / tickets, -scenario.showFees / tickets, -scenario.rehearsals / tickets,
      -scenario.expensePackage / tickets, -scenario.hotelling / tickets, -scenario.adjustment / tickets,
      scenario.beverageRevenue / tickets, scenario.operatingBalance / tickets,
    ];
    const measure = ['absolute', ...Array(10).fill('relative'), 'total'];
    return plot(8, [{
      type: 'waterfall', x: labels, y: values, measure,
      connector: { line: { dash: 'dot' } }, hovertemplate: '%{x}<br>%{y:.2f} €<extra></extra>',
    }], basePlotLayout(`Один билет · ${scenario.id}`, {
      xaxis: { tickangle: -30 }, yaxis: { title: '€ / билет' }, shapes: [zeroLine('y')], showlegend: false,
    }));
  }

  function scatterWithOls(chartId, xKey, xTitle, title, referenceX = null) {
    const traces = [];
    app.prices.forEach((price) => {
      const group = app.scenarios.filter((s) => s.price === price);
      const x = group.map((s) => s[xKey]);
      const y = group.map((s) => s.operatingBalance);
      const fit = ols(x, y);
      traces.push({
        type: 'scattergl', mode: 'markers', name: money(price), x, y,
        customdata: group.map((s) => s.id),
        marker: { size: 7, opacity: 0.68 },
        hovertemplate: '%{customdata}<br>x %{x:.1f}<br>Остаток %{y:.1f} €<extra></extra>',
      });
      const minX = Math.min(...x); const maxX = Math.max(...x);
      traces.push({
        type: 'scatter', mode: 'lines', name: `${money(price)} OLS R²=${fit.r2.toFixed(2)}`,
        x: [minX, maxX], y: [fit.slope * minX + fit.intercept, fit.slope * maxX + fit.intercept],
        line: { dash: 'dot', width: 1.5 }, hoverinfo: 'skip', showlegend: true,
      });
    });
    traces.push(selectedMarkerTrace(xKey, 'operatingBalance'));
    const shapes = [zeroLine('y')];
    if (referenceX !== null) shapes.push(zeroLine('x', referenceX, 'dash'));
    return plot(chartId, traces, basePlotLayout(title, {
      xaxis: { title: xTitle }, yaxis: { title: 'Операционный остаток, €' }, shapes,
    })).then(() => addClickSelection(chartId));
  }

  function renderChart9() {
    return scatterWithOls(9, 'tickets', 'Посещаемость, гостей', 'Остаток × посещаемость', 98);
  }

  function renderChart10() {
    const ranked = [...app.scenarios].sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity));
    const x = ranked.map((_, index) => index + 1);
    const y = ranked.map((scenario) => scenario.margin);
    const rolling = rollingMedian(y.filter(Number.isFinite), 11);
    const selectedRank = ranked.findIndex((scenario) => scenario.id === app.selectedScenarioId) + 1;
    const p5Rank = ranked.findIndex((scenario) => scenario.id === 'P5') + 1;
    const finiteMargins = y.filter(Number.isFinite);
    return plot(10, [
      { type: 'scattergl', mode: 'markers', name: 'Сценарии', x, y, customdata: ranked.map((scenario) => scenario.id), marker: { size: 7 }, hovertemplate: '%{customdata}<br>Ранг %{x}<br>Маржа %{y:.1f}%<extra></extra>' },
      { type: 'scatter', mode: 'lines', name: 'Rolling median', x: x.slice(0, rolling.length), y: rolling, line: { width: 2.5 }, hovertemplate: 'Ранг %{x}<br>Медиана %{y:.1f}%<extra></extra>' },
    ], basePlotLayout('Рейтинг маржи', {
      xaxis: { title: 'Ранг по марже' }, yaxis: { title: 'Маржа, %' },
      shapes: [zeroLine('y'), ...(p5Rank > 0 ? [zeroLine('x', p5Rank, 'dot')] : []), zeroLine('x', selectedRank, 'dashdot'), zeroLine('y', median(finiteMargins), 'dash')],
      annotations: p5Rank > 0 ? [{ x: p5Rank, y: 1, xref: 'x', yref: 'paper', text: `P5: ранг ${p5Rank}`, showarrow: false, yanchor: 'bottom' }] : [],
    })).then(() => addClickSelection(10));
  }

  function packagePriceMeans() {
    return PACKAGE_MULTIPLIERS.map((pack) => app.prices.map((price) => mean(app.scenarios.filter((s) => s.packageMultiplier === pack && s.price === price).map((s) => s.operatingBalance))));
  }

  function renderChart11() {
    const z = packagePriceMeans();
    return plot(11, [
      {
        type: 'heatmap', x: app.prices, y: PACKAGE_MULTIPLIERS, z,
        colorscale: 'RdYlGn', zmid: 0, colorbar: { title: '€' },
        hovertemplate: 'Цена %{x:.1f} €<br>Пакет ×%{y:.2f}<br>Средний остаток %{z:.1f} €<extra></extra>',
      },
      {
        type: 'contour', x: app.prices, y: PACKAGE_MULTIPLIERS, z, showscale: false, hoverinfo: 'skip',
        contours: { start: 0, end: 0, size: 1, coloring: 'none', showlabels: true },
        line: { color: '#17242b', width: 2 }, name: 'Остаток €0',
      },
    ], basePlotLayout('Пакет расходов × цена', {
      xaxis: { title: 'Цена, €' }, yaxis: { title: 'Множитель пакета', tickvals: PACKAGE_MULTIPLIERS },
      shapes: [zeroLine('x', app.inputs.analysisBasePrice, 'dashdot')],
    }));
  }

  function renderChart12() {
    const means = packagePriceMeans();
    const traces = PACKAGE_MULTIPLIERS.map((pack, i) => ({
      type: 'scatter', mode: 'lines+markers', name: `Пакет ×${pack.toFixed(2)}`,
      x: app.prices, y: means[i], hovertemplate: 'Цена %{x:.1f} €<br>Средний остаток %{y:.1f} €<extra></extra>',
    }));
    return plot(12, traces, basePlotLayout('Marginal trend пакета расходов', {
      xaxis: { title: 'Цена, €' }, yaxis: { title: 'Средний остаток, €' },
      shapes: [zeroLine('y'), zeroLine('x', app.inputs.analysisBasePrice, 'dashdot')],
    }));
  }

  function renderChart13() {
    const x = app.prices;
    const iva = x.map((price) => price - price / (1 + app.inputs.ticketIvaRate));
    const tm = x.map((price) => (app.inputs.tmBase === 'gross' ? price : price / (1 + app.inputs.ticketIvaRate)) * app.inputs.tmRate);
    const remittance = x.map((price, index) => price - iva[index] - tm[index]);
    return plot(13, [
      { type: 'bar', name: 'IVA', x, y: iva },
      { type: 'bar', name: 'Ticketmaster', x, y: tm },
      { type: 'bar', name: 'Перечисление', x, y: remittance },
    ], basePlotLayout('Состав IVA и комиссии на билет', {
      barmode: 'stack', xaxis: { title: 'Цена, €' }, yaxis: { title: '€ / билет' },
      shapes: [zeroLine('x', app.inputs.analysisBasePrice, 'dashdot')],
      annotations: [{ x: 1, xref: 'paper', y: 1.08, yref: 'paper', text: `TM ${percent(app.inputs.tmRate * 100)} · база ${app.inputs.tmBase === 'gross' ? 'brutto' : 'без IVA'}`, showarrow: false, xanchor: 'right' }],
    }));
  }

  function renderChart14() {
    return scatterWithOls(14, 'directCosts', 'Прямые расходы, €', 'Остаток × прямые расходы', selectedScenario().directCosts);
  }

  function renderChart15() {
    const values = app.scenarios.map((s) => s.operatingBalance);
    const kde = kdeSilverman(values);
    const binCount = 22;
    const binWidth = (Math.max(...values) - Math.min(...values)) / binCount || 1;
    const scaledDensity = kde.y.map((v) => v * values.length * binWidth);
    return plot(15, [
      { type: 'histogram', name: 'Сценарии', x: values, nbinsx: binCount, opacity: 0.72, hovertemplate: 'Остаток %{x:.1f} €<br>Частота %{y}<extra></extra>' },
      { type: 'scatter', mode: 'lines', name: `KDE Silverman h=${money(kde.bandwidth)}`, x: kde.x, y: scaledDensity, line: { width: 2.5 }, hovertemplate: 'Остаток %{x:.1f} €<br>KDE %{y:.2f}<extra></extra>' },
    ], basePlotLayout('Распределение операционного остатка', {
      bargap: 0.05, xaxis: { title: 'Операционный остаток, €' }, yaxis: { title: 'Частота' },
      shapes: [zeroLine('x'), zeroLine('x', median(values), 'dash')],
    }));
  }

  function renderChart16() {
    const sorted = [...app.scenarios.map((s) => s.operatingBalance)].sort((a, b) => a - b);
    const y = sorted.map((_, i) => (i + 1) / sorted.length * 100);
    return plot(16, [{
      type: 'scatter', mode: 'lines', line: { shape: 'hv' }, x: sorted, y,
      hovertemplate: 'Остаток ≤ %{x:.1f} €<br>Вероятность %{y:.1f}%<extra></extra>',
    }], basePlotLayout('ECDF операционного остатка', {
      xaxis: { title: 'Операционный остаток, €' }, yaxis: { title: 'ECDF, %', range: [0, 100] },
      shapes: [zeroLine('x'), zeroLine('y', 50, 'dash')], showlegend: false,
    }));
  }

  function renderChart17() {
    return plot(17, app.prices.map((price) => {
      const group = app.scenarios.filter((s) => s.price === price);
      return { type: 'box', name: money(price), y: group.map((s) => s.operatingBalance), boxpoints: 'outliers', hovertemplate: '%{y:.1f} €<extra></extra>' };
    }), basePlotLayout('Остаток по цене', {
      xaxis: { title: 'Цена' }, yaxis: { title: 'Операционный остаток, €' },
      shapes: [zeroLine('y')], showlegend: false,
    }));
  }

  function renderChart18() {
    return plot(18, OCCUPANCIES.map((occ) => {
      const group = app.scenarios.filter((s) => s.occupancy === occ);
      return { type: 'box', name: `${occ}%`, y: group.map((s) => s.operatingBalance), boxpoints: 'outliers', hovertemplate: '%{y:.1f} €<extra></extra>' };
    }), basePlotLayout('Остаток по загрузке', {
      xaxis: { title: 'Загрузка' }, yaxis: { title: 'Операционный остаток, €' },
      shapes: [zeroLine('y')], showlegend: false,
    }));
  }

  function renderChart19() {
    const overall = mean(app.scenarios.map((s) => s.operatingBalance));
    const factorDefs = [
      ['Цена', app.prices, 'price', (v) => money(v)],
      ['Загрузка', OCCUPANCIES, 'occupancy', (v) => `${v}%`],
      ['Гонорар', FEE_MULTIPLIERS, 'feeMultiplier', (v) => `×${v.toFixed(2)}`],
      ['Пакет', PACKAGE_MULTIPLIERS, 'packageMultiplier', (v) => `×${v.toFixed(2)}`],
    ];
    const traces = factorDefs.map(([name, levels, key, fmt]) => ({
      type: 'scatter', mode: 'lines+markers', name,
      x: levels.map((v) => `${name}: ${fmt(v)}`),
      y: levels.map((v) => mean(app.scenarios.filter((s) => s[key] === v).map((s) => s.operatingBalance))),
      hovertemplate: '%{x}<br>Средний остаток %{y:.1f} €<extra></extra>',
    }));
    return plot(19, traces, basePlotLayout('Главные эффекты факторов', {
      xaxis: { title: 'Уровень фактора', tickangle: -30 }, yaxis: { title: 'Маргинальный средний остаток, €' },
      shapes: [zeroLine('y', overall, 'dash')],
      annotations: [{ x: 1, xref: 'paper', y: overall, yref: 'y', text: `Общее среднее ${money(overall)}`, showarrow: false, xanchor: 'right', yanchor: 'bottom' }],
    }));
  }

  function renderChart20() {
    const traces = OCCUPANCIES.map((occ) => ({
      type: 'scatter', mode: 'lines+markers', name: `${occ}%`, x: app.prices,
      y: app.prices.map((price) => mean(app.scenarios.filter((s) => s.price === price && s.occupancy === occ).map((s) => s.operatingBalance))),
      hovertemplate: `Загрузка ${occ}%<br>Цена %{x:.1f} €<br>Средний остаток %{y:.1f} €<extra></extra>`,
    }));
    return plot(20, traces, basePlotLayout('Interaction: цена × загрузка', {
      xaxis: { title: 'Цена, €' }, yaxis: { title: 'Маргинальный средний остаток, €' },
      shapes: [zeroLine('y'), zeroLine('x', app.inputs.analysisBasePrice, 'dashdot')],
    }));
  }

  function paretoFrontier(scenarios) {
    const sorted = [...scenarios].sort((a, b) => a.directCosts - b.directCosts || b.operatingBalance - a.operatingBalance);
    const frontier = [];
    let bestBalance = -Infinity;
    sorted.forEach((s) => {
      if (s.operatingBalance > bestBalance) {
        frontier.push(s);
        bestBalance = s.operatingBalance;
      }
    });
    return frontier;
  }

  function renderChart21() {
    const frontier = paretoFrontier(app.scenarios);
    return plot(21, [
      { type: 'scattergl', mode: 'markers', name: 'Все сценарии', x: app.scenarios.map((s) => s.directCosts), y: app.scenarios.map((s) => s.operatingBalance), customdata: app.scenarios.map((s) => s.id), marker: { size: 7, opacity: 0.55 }, hovertemplate: '%{customdata}<br>Расходы %{x:.1f} €<br>Остаток %{y:.1f} €<extra></extra>' },
      { type: 'scatter', mode: 'lines+markers', name: 'Pareto frontier', x: frontier.map((s) => s.directCosts), y: frontier.map((s) => s.operatingBalance), customdata: frontier.map((s) => s.id), line: { width: 3 }, marker: { size: 8 }, hovertemplate: '%{customdata}<br>Расходы %{x:.1f} €<br>Остаток %{y:.1f} €<extra></extra>' },
      selectedMarkerTrace('directCosts', 'operatingBalance'),
    ], basePlotLayout('Pareto: расходы × остаток', {
      xaxis: { title: 'Прямые расходы, €' }, yaxis: { title: 'Операционный остаток, €' },
      shapes: [zeroLine('y'), zeroLine('x', selectedScenario().directCosts, 'dashdot')],
    })).then(() => addClickSelection(21));
  }

  function renderChart22() {
    const metrics = [
      ['Цена', (s) => s.price], ['Загрузка', (s) => s.occupancy], ['Гости', (s) => s.tickets],
      ['Расходы', (s) => s.directCosts], ['Brutto', (s) => s.grossRevenue], ['Netto', (s) => s.netRevenue],
      ['Остаток', (s) => s.operatingBalance], ['Маржа', (s) => s.margin], ['Запас', (s) => s.safetyMargin], ['IN-03', (s) => s.adjustment],
    ];
    const arrays = metrics.map(([, fn]) => app.scenarios.map(fn));
    const z = arrays.map((x) => arrays.map((y) => pearson(x, y)));
    return plot(22, [{
      type: 'heatmap', x: metrics.map((m) => m[0]), y: metrics.map((m) => m[0]), z,
      zmin: -1, zmax: 1, zmid: 0, colorscale: 'RdBu', reversescale: true,
      colorbar: { title: 'r' }, hovertemplate: '%{y} × %{x}<br>r=%{z:.3f}<extra></extra>',
    }], basePlotLayout('Корреляционная матрица', {
      xaxis: { tickangle: -35 }, yaxis: { autorange: 'reversed' },
    }));
  }

  function renderChart23() {
    const basePrice = app.inputs.analysisBasePrice;
    const scenarios = OCCUPANCIES.map((occ) => scenarioAt(app.inputs, app.model, basePrice, occ, 1, 1));
    const components = [
      ['Аренда', 'venue'], ['Маркетинг', 'marketing'], ['Артисты', 'showFees'], ['Репетиции', 'rehearsals'],
      ['Пакет', 'expensePackage'], ['Hotelling', 'hotelling'], ['IN-03', 'adjustment'],
    ];
    const traces = components.map(([name, key]) => ({ type: 'bar', name, x: OCCUPANCIES, y: scenarios.map((s) => s[key]), hovertemplate: `${name}<br>%{x}%<br>%{y:.1f} €<extra></extra>` }));
    traces.push({ type: 'scatter', mode: 'lines+markers', name: 'Общие расходы', x: OCCUPANCIES, y: scenarios.map((s) => s.directCosts), line: { width: 3 }, hovertemplate: 'Расходы<br>%{x}%<br>%{y:.1f} €<extra></extra>' });
    traces.push({ type: 'scatter', mode: 'lines+markers', name: 'Brutto-выручка', x: OCCUPANCIES, y: scenarios.map((s) => s.grossRevenue), line: { width: 3, dash: 'dash' }, hovertemplate: 'Brutto<br>%{x}%<br>%{y:.1f} €<extra></extra>' });
    const occ98 = app.inputs.seats ? 98 / app.inputs.seats * 100 : null;
    const shapes = [zeroLine('x', 75, 'dash')];
    if (occ98 && occ98 <= 100) shapes.push(zeroLine('x', occ98, 'dot'));
    return plot(23, traces, basePlotLayout('Структура расходов события по загрузке', {
      barmode: 'stack', xaxis: { title: 'Загрузка, %' }, yaxis: { title: '€ за событие' }, shapes,
    }));
  }

  function renderChart24() {
    const top = [...app.scenarios].sort((a, b) => a.mcdaMeanRank - b.mcdaMeanRank).slice(0, 25).reverse();
    const overall = mean(app.scenarios.map((s) => s.mcdaMeanRank));
    return plot(24, [{
      type: 'bar', orientation: 'h', x: top.map((s) => s.mcdaMeanRank), y: top.map((s) => s.id), customdata: top.map((s) => s.id),
      marker: { color: top.map((s) => s.id === app.selectedScenarioId ? '#d35400' : s.mcdaMeanRank) },
      hovertemplate: '%{customdata}<br>Средний ранг %{x:.2f}<extra></extra>',
    }], basePlotLayout('Top-25 по среднему MCDA-рангу', {
      xaxis: { title: 'Средний ранг — меньше лучше' }, yaxis: { title: 'Сценарий' },
      shapes: [zeroLine('x', 5, 'dot'), zeroLine('x', overall, 'dash')], showlegend: false,
    })).then(() => addClickSelection(24));
  }

  function renderChart25() {
    const top = [...app.scenarios].sort((a, b) => a.mcdaMeanRank - b.mcdaMeanRank).slice(0, 25);
    const medStd = median(top.map((s) => s.mcdaRankStd));
    return plot(25, [
      { type: 'scatter', mode: 'markers+text', name: 'Top-25', x: top.map((s) => s.mcdaMeanRank), y: top.map((s) => s.mcdaRankStd), text: top.map((s) => s.id), textposition: 'top center', customdata: top.map((s) => s.id), marker: { size: top.map((s) => 8 + s.mcdaTop5Rate / 8), opacity: 0.75 }, hovertemplate: '%{customdata}<br>Средний ранг %{x:.2f}<br>σ ранга %{y:.2f}<extra></extra>' },
      { type: 'scatter', mode: 'markers', name: 'Выбранный', x: [selectedScenario().mcdaMeanRank], y: [selectedScenario().mcdaRankStd], customdata: [selectedScenario().id], marker: { size: 16, symbol: 'diamond', color: '#d35400', line: { color: '#fff', width: 2 } }, hovertemplate: '%{customdata}<br>Средний ранг %{x:.2f}<br>σ %{y:.2f}<extra></extra>' },
    ], basePlotLayout('Устойчивость MCDA-ранга', {
      xaxis: { title: 'Средний ранг — меньше лучше' }, yaxis: { title: 'Стандартное отклонение ранга' },
      shapes: [zeroLine('x', 5, 'dot'), zeroLine('y', medStd, 'dash')],
    })).then(() => addClickSelection(25));
  }

  const CHART_RENDERERS = [
    renderChart1, renderChart2, renderChart3, renderChart4, renderChart5,
    renderChart6, renderChart7, renderChart8, renderChart9, renderChart10,
    renderChart11, renderChart12, renderChart13, renderChart14, renderChart15,
    renderChart16, renderChart17, renderChart18, renderChart19, renderChart20,
    renderChart21, renderChart22, renderChart23, renderChart24, renderChart25,
  ];

  function setupChartObserver() {
    if (!('IntersectionObserver' in window)) return;
    app.chartObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) renderSingleChart(Number(entry.target.dataset.chartId));
      });
    }, { rootMargin: '700px 0px', threshold: 0.01 });
    document.querySelectorAll('.chart-card').forEach((card) => app.chartObserver.observe(card));
  }

  async function renderSingleChart(id) {
    if (!window.Plotly || !app.scenarios.length || !app.chartDirty.has(id) || app.chartRendering.has(id)) return;
    const renderer = CHART_RENDERERS[id - 1];
    if (!renderer) return;
    const version = app.chartVersion;
    app.chartRendering.add(id);
    const div = $(`chart-${id}`);
    div.classList.add('is-rendering');
    try {
      await renderer();
      if (version === app.chartVersion) app.chartDirty.delete(id);
    } catch (error) {
      console.error('Chart render failed', renderer.name, error);
      div.innerHTML = `<div class="chart-error">Не удалось построить панель: ${String(error.message || error)}</div>`;
    } finally {
      div.classList.remove('is-rendering');
      app.chartRendering.delete(id);
      if (app.chartDirty.has(id)) requestAnimationFrame(() => renderSingleChart(id));
    }
  }

  function renderVisibleCharts() {
    document.querySelectorAll('.chart-card').forEach((card) => {
      const rect = card.getBoundingClientRect();
      if (rect.top < window.innerHeight + 750 && rect.bottom > -500) {
        renderSingleChart(Number(card.dataset.chartId));
      }
    });
  }

  function renderCharts() {
    app.chartVersion += 1;
    if (!window.Plotly) {
      document.querySelectorAll('.chart').forEach((div) => {
        div.innerHTML = '<div class="plotly-missing">Plotly не загружен. Проверьте наличие файла plotly.min.js рядом с index.html.</div>';
      });
      return;
    }
    if (!app.scenarios.length) {
      document.querySelectorAll('.chart').forEach((div) => {
        div.innerHTML = '<div class="plotly-missing">График недоступен: нет валидных сценариев для текущих параметров.</div>';
      });
      return;
    }
    for (let id = 1; id <= CHART_RENDERERS.length; id += 1) app.chartDirty.add(id);
    requestAnimationFrame(renderVisibleCharts);
  }

  async function renderAllChartsForTests() {
    renderCharts();
    for (let id = 1; id <= CHART_RENDERERS.length; id += 1) await renderSingleChart(id);
    return true;
  }

  function recalculate(forceCharts = false) {
    applyDependencies();
    const readResult = readInputs();
    if (!validateInputs(readResult)) return false;
    const inputs = readResult.inputs;
    const model = computeBaseModel(inputs);
    inputs.kPrice = Number.isFinite(model.dynamicBreakEven) && model.dynamicBreakEven > 0 ? ceil01(model.dynamicBreakEven * inputs.kCoefficient) : NaN;
    inputs.analysisBasePrice = inputs.useKPrice ? inputs.kPrice : ceil01(inputs.manualAnalysisBasePrice);
    let generated = { scenarios: [], prices: [], error: '' };
    if (model.valid && Number.isFinite(inputs.analysisBasePrice)) generated = generateScenarios(inputs, model);
    else if (!model.valid) generated.error = model.failureReason;
    else generated.error = model.kUnavailableReason || model.dynamicBreakEvenReason || 'K недоступен: конечная цена безубыточности не найдена.';

    app.inputs = inputs;
    app.model = model;
    app.scenarios = generated.scenarios;
    app.prices = generated.prices;
    const nearest = nearestScenario(app.scenarios, inputs);
    if (!nearest) app.selectedScenarioId = null;
    else if (!app.selectedScenarioId || !app.scenarios.some((scenario) => scenario.id === app.selectedScenarioId)) app.selectedScenarioId = nearest.id;
    app.lastValidSnapshot = { inputs, model };
    saveState();
    renderSummary();
    populateFilters(app.prices);
    renderTable();
    renderOccupancyTable();
    renderRecommendations();
    renderMcdaStatus();
    const extra = [];
    if (!model.valid) extra.push(model.failureReason);
    if (inputs.useKPrice && !Number.isFinite(inputs.kPrice)) extra.push(model.kUnavailableReason || `${model.kUnavailableReason || `K недоступен: ${model.dynamicBreakEvenReason}`}`);
    if (generated.error) extra.push(generated.error);
    if (!window.Plotly) extra.push('Plotly не загружен; аналитические панели недоступны.');
    showValidationIssues([], [...new Set(extra)]);
    if (forceCharts || inputs.autoUpdate) renderCharts();
    return true;
  }

  let debounceTimer = null;
  function scheduleRecalculation() {
    applyDependencies();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => recalculate(false), 300);
  }

  function showTransientError(error) {
    showValidationIssues([], [String(error?.message || error)]);
  }

  function bindEvents() {
    document.querySelectorAll('.controls input, .controls select').forEach((el) => {
      el.addEventListener('input', scheduleRecalculation);
      el.addEventListener('change', scheduleRecalculation);
    });
    ['filterPrice', 'filterOccupancy', 'filterResult', 'filterId'].forEach((id) => {
      $(id).addEventListener(id === 'filterId' ? 'input' : 'change', renderTable);
    });
    document.querySelectorAll('.sort-button').forEach((button) => button.addEventListener('click', () => setScenarioSort(button.dataset.sort)));
    document.querySelectorAll('.k-preset').forEach((button) => button.addEventListener('click', () => {
      $('kCoefficient').value = button.dataset.k;
      recalculate(true);
    }));
    $('recalculateBtn').addEventListener('click', () => recalculate(true));
    $('resetBtn').addEventListener('click', resetState);
    $('clearDataBtn').addEventListener('click', clearAllSavedData);
    $('exportProjectBtn').addEventListener('click', exportProject);
    $('importProjectBtn').addEventListener('click', () => $('projectFile').click());
    $('projectFile').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try { await importProjectFile(file); } catch (error) { showTransientError(error); }
      event.target.value = '';
    });
    $('exportCsvCurrent').addEventListener('click', () => downloadScenarioCsv('current'));
    $('exportCsvAll').addEventListener('click', () => downloadScenarioCsv('all'));
    $('exportOccupancyCsv').addEventListener('click', downloadOccupancyCsv);
    $('importMcdaBtn').addEventListener('click', () => $('mcdaFile').click());
    $('clearMcdaBtn').addEventListener('click', clearMcda);
    $('mcdaFile').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try { await importMcdaFile(file); } catch (error) { showTransientError(error); }
      event.target.value = '';
    });
    $('useFormulaPrice').addEventListener('click', () => {
      if (!app.model || !Number.isFinite(app.model.ticketPrice)) return;
      $('useKPrice').checked = false;
      $('analysisBasePrice').value = app.model.ticketPrice;
      applyDependencies();
      recalculate(true);
    });
  }

  function init() {
    if (!$('concertDate').value) $('concertDate').value = DEFAULTS.concertDate;
    initChartsGrid();
    initCatalog();
    loadState();
    applyDependencies();
    bindEvents();
    recalculate(true);
  }

  window.StageEconomicsTestApi = {
    app, ceil01, readInputs, computeBaseModel, scenarioAt, findBreakEvenPrice, solveBaseHotelling,
    calendarDayDifference, addCalendarDays, recalculate, occupancyRows, filteredScenarios,
    renderAllChartsForTests, renderChartForTests(id) { app.chartDirty.add(id); return renderSingleChart(id); }, parseMcdaText,
    setValue(id, value) { const el = $(id); if (!el) throw new Error(`Unknown field ${id}`); if (el.type === 'checkbox') el.checked = Boolean(value); else el.value = value; },
    getNonFiniteChartIds() {
      return [...document.querySelectorAll('.chart')].filter((div) => div.dataset.hasNonFinite === 'true').map((div) => div.id);
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
