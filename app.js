(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ROUND_EPS = 1e-9;
  const STORAGE_KEY = 'stage-economics-calculator-v1';
  const PRICE_MULTIPLIERS = [0.75, 0.9, 1, 1.1, 1.25, 1.5];
  const OCCUPANCIES = [35, 50, 65, 75, 90, 100];
  const FEE_MULTIPLIERS = [0.85, 1, 1.15];
  const PACKAGE_MULTIPLIERS = [1, 1.25];
  const IVA_21 = 0.21;

  const DEFAULTS = {
    venueRent: 8500,
    venueMode: 'a',
    seats: 600,
    daysToShow: 60,
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
    expensePackage: 1000,
    analysisBasePrice: 35,
    baseOccupancy: 75,
    beverageContribution: 2.5,
    tornadoShock: 10,
    autoUpdate: true,
  };

  const INPUT_IDS = Object.keys(DEFAULTS);
  const CHECKBOX_IDS = new Set([
    'agencyIncludesIva', 'digitalIncludesIva', 'rehearsalEnabled',
    'hotellingEnabled', 'autoUpdate',
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
    ['Средний MCDA-ранг', 'Средний ранг по 25 live-proxy наборам весов.', 'Среднее по 25 прогонам.', 'Top-5, общий средний, выбранный сценарий.', 'Клик по столбцу, hover, PNG.'],
    ['Устойчивость MCDA-ранга', 'Средний ранг против стандартного отклонения.', 'Эмпирическая устойчивость 25 прогонов.', 'Top-5, медиана, выбранный сценарий.', 'Клик по точке, hover, zoom, PNG.'],
  ];

  const app = {
    inputs: null,
    model: null,
    scenarios: [],
    selectedScenarioId: null,
    chartRenderToken: 0,
    chartVersion: 0,
    chartDirty: new Set(),
    chartRendering: new Set(),
    chartObserver: null,
  };

  function ceil01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.ceil((value - ROUND_EPS) * 10) / 10;
  }

  function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function num(id, fallback = 0) {
    const value = Number($(id).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function money(value, digits = 1) {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value || 0);
  }

  function number(value, digits = 1) {
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value || 0);
  }

  function percent(value, digits = 1) {
    return `${number(value, digits)}%`;
  }

  function readInputs() {
    return {
      venueRent: clamp(num('venueRent', DEFAULTS.venueRent), 50, 200000),
      venueMode: $('venueMode').value,
      seats: Math.round(clamp(num('seats', DEFAULTS.seats), 10, 30000)),
      daysToShow: Math.round(clamp(num('daysToShow', DEFAULTS.daysToShow), 1, 730)),
      agencyMonthly: clamp(num('agencyMonthly', DEFAULTS.agencyMonthly), 0, 200000),
      agencyIncludesIva: $('agencyIncludesIva').checked,
      digitalDaily: clamp(num('digitalDaily', DEFAULTS.digitalDaily), 10, 100),
      digitalIncludesIva: $('digitalIncludesIva').checked,
      artistCount: Math.round(clamp(num('artistCount', DEFAULTS.artistCount), 1, 5000)),
      artistShowFee: clamp(num('artistShowFee', DEFAULTS.artistShowFee), 0, 100000),
      rehearsalEnabled: $('rehearsalEnabled').checked,
      rehearsalHours: clamp(num('rehearsalHours', DEFAULTS.rehearsalHours), 0, 2000),
      rehearsalHourlyFee: clamp(num('rehearsalHourlyFee', DEFAULTS.rehearsalHourlyFee), 0, 10000),
      hotellingEnabled: $('hotellingEnabled').checked,
      hotellingRate: clamp(num('hotellingRate', DEFAULTS.hotellingRate), 0, 33) / 100,
      ticketIvaRate: clamp(num('ticketIvaRate', DEFAULTS.ticketIvaRate), 0, 30) / 100,
      tmRate: clamp(num('tmRate', DEFAULTS.tmRate), 0, 20) / 100,
      expensePackage: clamp(num('expensePackage', DEFAULTS.expensePackage), 0, 200000),
      analysisBasePrice: clamp(num('analysisBasePrice', DEFAULTS.analysisBasePrice), 1, 5000),
      baseOccupancy: clamp(num('baseOccupancy', DEFAULTS.baseOccupancy), 1, 100),
      beverageContribution: clamp(num('beverageContribution', DEFAULTS.beverageContribution), 0, 100),
      tornadoShock: clamp(num('tornadoShock', DEFAULTS.tornadoShock), 5, 20) / 100,
      autoUpdate: $('autoUpdate').checked,
    };
  }

  function venueGross(inputs) {
    if (inputs.venueMode === 'b') return ceil01(inputs.venueRent * 1.21);
    if (inputs.venueMode === 'c') return ceil01((inputs.venueRent / 0.66) * 1.21);
    return ceil01(inputs.venueRent);
  }

  function gross21(amount, alreadyIncludes) {
    return ceil01(alreadyIncludes ? amount : amount * 1.21);
  }

  function in03Adjustment(direct) {
    return ceil01((0.03025 * direct + 1.4641) / 1.06975);
  }

  function computeBaseModel(inputs) {
    const venue = venueGross(inputs);
    const agencyMonthlyGross = gross21(inputs.agencyMonthly, inputs.agencyIncludesIva);
    const agencyPeriod = ceil01(agencyMonthlyGross * inputs.daysToShow / 30);
    const digitalDailyGross = gross21(inputs.digitalDaily, inputs.digitalIncludesIva);
    const digitalTotal = ceil01(digitalDailyGross * inputs.daysToShow);
    const marketing = ceil01(agencyPeriod + digitalTotal);
    const showFees = ceil01(inputs.artistCount * inputs.artistShowFee);
    const rehearsals = inputs.rehearsalEnabled
      ? ceil01(inputs.artistCount * inputs.rehearsalHourlyFee * inputs.rehearsalHours)
      : 0;
    const expensePackage = ceil01(inputs.expensePackage);
    const fixedBeforeHotelling = ceil01(venue + marketing + showFees + rehearsals + expensePackage);

    let hotelling = 0;
    let ticketPrice = 0;
    let finalGross = 0;
    let adjustment = 0;
    let direct = fixedBeforeHotelling;
    let iterations = 0;
    let converged = false;

    for (let i = 0; i < 100; i += 1) {
      iterations = i + 1;
      direct = ceil01(fixedBeforeHotelling + hotelling);
      adjustment = in03Adjustment(direct);
      finalGross = ceil01(direct + adjustment);
      ticketPrice = ceil01(finalGross / inputs.seats);
      const nextHotelling = inputs.hotellingEnabled
        ? ceil01((ticketPrice / (1 + inputs.ticketIvaRate)) * inputs.seats * inputs.hotellingRate)
        : 0;
      if (Math.abs(nextHotelling - hotelling) < 0.05) {
        hotelling = nextHotelling;
        converged = true;
        break;
      }
      hotelling = nextHotelling;
    }

    direct = ceil01(fixedBeforeHotelling + hotelling);
    adjustment = in03Adjustment(direct);
    finalGross = ceil01(direct + adjustment);
    ticketPrice = ceil01(finalGross / inputs.seats);

    const model = {
      venue,
      agencyMonthlyGross,
      agencyPeriod,
      digitalDailyGross,
      digitalTotal,
      marketing,
      showFees,
      rehearsals,
      expensePackage,
      fixedBeforeHotelling,
      hotelling,
      direct,
      adjustment,
      finalGross,
      ticketPrice,
      iterations,
      converged,
    };
    model.dynamicBreakEven = findBreakEvenPrice(inputs, model, inputs.baseOccupancy, 1, 1);
    return model;
  }

  function scenarioAt(inputs, model, price, occupancy, feeMultiplier = 1, packageMultiplier = 1, overrides = {}) {
    const tickets = Math.max(1, Math.round(inputs.seats * clamp(occupancy, 0.01, 100) / 100));
    const venue = ceil01(model.venue * (overrides.venueMultiplier ?? 1));
    const marketing = ceil01(model.marketing * (overrides.marketingMultiplier ?? 1));
    const showFees = ceil01(model.showFees * feeMultiplier * (overrides.artistMultiplier ?? 1));
    const rehearsals = ceil01(model.rehearsals * feeMultiplier * (overrides.rehearsalMultiplier ?? 1));
    const expensePackage = ceil01(model.expensePackage * packageMultiplier * (overrides.packageMultiplier ?? 1));
    const effectiveHotellingRate = inputs.hotellingEnabled
      ? inputs.hotellingRate * (overrides.hotellingMultiplier ?? 1)
      : 0;
    const hotelling = ceil01((price / (1 + inputs.ticketIvaRate)) * tickets * effectiveHotellingRate);
    const directBeforeAdjustment = ceil01(venue + marketing + showFees + rehearsals + expensePackage + hotelling);
    const adjustment = in03Adjustment(directBeforeAdjustment);
    const directCosts = ceil01(directBeforeAdjustment + adjustment);

    const grossRevenue = round2(price * tickets);
    const ticketIva = ceil01(grossRevenue - grossRevenue / (1 + inputs.ticketIvaRate));
    const tmRate = clamp(inputs.tmRate * (overrides.tmMultiplier ?? 1), 0, 0.99);
    const tmCommission = ceil01((grossRevenue - ticketIva) * tmRate);
    const remittance = round2(grossRevenue - ticketIva - tmCommission);
    const beverageRevenue = round2(inputs.beverageContribution * (overrides.beverageMultiplier ?? 1) * tickets);
    const netRevenue = round2(remittance + beverageRevenue);
    const operatingBalance = round2(netRevenue - directCosts);
    const margin = netRevenue === 0 ? -100 : round2(operatingBalance / netRevenue * 100);
    const safetyMargin = grossRevenue === 0 ? -100 : round2(operatingBalance / grossRevenue * 100);

    return {
      price: ceil01(price),
      occupancy: round2(occupancy),
      tickets,
      feeMultiplier,
      packageMultiplier,
      venue,
      marketing,
      showFees,
      rehearsals,
      expensePackage,
      hotelling,
      adjustment,
      directCosts,
      grossRevenue,
      ticketIva,
      tmCommission,
      remittance,
      beverageRevenue,
      netRevenue,
      operatingBalance,
      margin,
      safetyMargin,
      positive: operatingBalance >= 0,
    };
  }

  function findBreakEvenPrice(inputs, model, occupancy, feeMultiplier = 1, packageMultiplier = 1) {
    let low = 0;
    let high = Math.max(10, model.ticketPrice * 2, inputs.analysisBasePrice * 2);
    let highScenario = scenarioAt(inputs, model, high, occupancy, feeMultiplier, packageMultiplier);
    let guard = 0;
    while (highScenario.operatingBalance < 0 && high < 100000 && guard < 40) {
      high *= 1.7;
      highScenario = scenarioAt(inputs, model, high, occupancy, feeMultiplier, packageMultiplier);
      guard += 1;
    }
    if (highScenario.operatingBalance < 0) return null;
    for (let i = 0; i < 70; i += 1) {
      const mid = (low + high) / 2;
      const s = scenarioAt(inputs, model, mid, occupancy, feeMultiplier, packageMultiplier);
      if (s.operatingBalance >= 0) high = mid;
      else low = mid;
    }
    return ceil01(high);
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
    const prices = uniquePriceLevels(inputs.analysisBasePrice);
    const scenarios = [];
    let counter = 1;
    for (const price of prices) {
      for (const occupancy of OCCUPANCIES) {
        for (const feeMultiplier of FEE_MULTIPLIERS) {
          for (const packageMultiplier of PACKAGE_MULTIPLIERS) {
            const s = scenarioAt(inputs, model, price, occupancy, feeMultiplier, packageMultiplier);
            s.id = `P${counter}`;
            scenarios.push(s);
            counter += 1;
          }
        }
      }
    }
    attachMcda(scenarios);
    return { scenarios, prices };
  }

  function normalize(values, invert = false) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values.map((v) => {
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

  function attachMcda(scenarios) {
    const metrics = [
      normalize(scenarios.map((s) => s.operatingBalance)),
      normalize(scenarios.map((s) => s.margin)),
      normalize(scenarios.map((s) => s.tickets)),
      normalize(scenarios.map((s) => s.safetyMargin)),
      normalize(scenarios.map((s) => s.directCosts), true),
    ];
    const ranksByScenario = scenarios.map(() => []);
    const scoresByScenario = scenarios.map(() => []);

    MCDA_WEIGHT_RUNS.forEach((weights) => {
      const scored = scenarios.map((s, idx) => ({
        idx,
        score: weights.reduce((sum, w, m) => sum + w * metrics[m][idx], 0),
      })).sort((a, b) => b.score - a.score);
      scored.forEach((item, rankIdx) => {
        ranksByScenario[item.idx].push(rankIdx + 1);
        scoresByScenario[item.idx].push(item.score);
      });
    });

    scenarios.forEach((s, idx) => {
      const ranks = ranksByScenario[idx];
      const meanRank = mean(ranks);
      const rankStd = stddev(ranks);
      s.mcdaMeanRank = round2(meanRank);
      s.mcdaRankStd = round2(rankStd);
      s.mcdaTop5Rate = round2(ranks.filter((r) => r <= 5).length / ranks.length * 100);
      s.mcdaScore = round2(mean(scoresByScenario[idx]) * 100);
      s.mcdaRanks = ranks;
    });
  }

  function mean(values) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function stddev(values) {
    if (values.length < 2) return 0;
    const m = mean(values);
    return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
  }

  function pearson(x, y) {
    const mx = mean(x);
    const my = mean(y);
    const numerator = x.reduce((sum, value, i) => sum + (value - mx) * (y[i] - my), 0);
    const denominator = Math.sqrt(
      x.reduce((sum, value) => sum + (value - mx) ** 2, 0) *
      y.reduce((sum, value) => sum + (value - my) ** 2, 0),
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
    document.querySelectorAll('.dependency-rehearsal').forEach((el) => el.classList.toggle('is-disabled', !$('rehearsalEnabled').checked));
    document.querySelectorAll('.dependency-hotelling').forEach((el) => el.classList.toggle('is-disabled', !$('hotellingEnabled').checked));
    $('tornadoShockOutput').textContent = `${$('tornadoShock').value}%`;
  }

  function validateInputs(inputs) {
    const issues = [];
    if (inputs.seats < 10 || inputs.seats > 30000) issues.push('Количество мест должно быть от 10 до 30 000.');
    if (inputs.venueRent < 50 || inputs.venueRent > 200000) issues.push('Аренда должна быть от €50 до €200 000.');
    if (inputs.digitalDaily < 10 || inputs.digitalDaily > 100) issues.push('Digital-реклама должна быть от €10 до €100 в день.');
    if (inputs.hotellingRate > 0.33) issues.push('Hotelling не может превышать 33%.');
    const banner = $('validationBanner');
    banner.hidden = issues.length === 0;
    banner.textContent = issues.join(' ');
    return issues.length === 0;
  }

  function saveState() {
    const state = {};
    INPUT_IDS.forEach((id) => {
      state[id] = CHECKBOX_IDS.has(id) ? $(id).checked : $(id).value;
    });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* storage may be blocked */ }
  }

  function loadState() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { state = null; }
    if (!state) return;
    INPUT_IDS.forEach((id) => {
      if (!(id in state)) return;
      if (CHECKBOX_IDS.has(id)) $(id).checked = Boolean(state[id]);
      else $(id).value = state[id];
    });
  }

  function resetState() {
    INPUT_IDS.forEach((id) => {
      if (CHECKBOX_IDS.has(id)) $(id).checked = Boolean(DEFAULTS[id]);
      else $(id).value = DEFAULTS[id];
    });
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* storage may be blocked */ }
    applyDependencies();
    recalculate(true);
  }

  function nearestScenario(scenarios, inputs) {
    return scenarios.reduce((best, s) => {
      const distance = Math.abs(s.price - inputs.analysisBasePrice) / Math.max(1, inputs.analysisBasePrice)
        + Math.abs(s.occupancy - inputs.baseOccupancy) / 100
        + Math.abs(s.feeMultiplier - 1)
        + Math.abs(s.packageMultiplier - 1);
      return !best || distance < best.distance ? { scenario: s, distance } : best;
    }, null).scenario;
  }

  function selectedScenario() {
    return app.scenarios.find((s) => s.id === app.selectedScenarioId) || app.scenarios[0];
  }

  function renderSummary() {
    const { inputs, model } = app;
    $('kpiTicketPrice').textContent = money(model.ticketPrice);
    $('kpiFinalGross').textContent = money(model.finalGross);
    $('kpiVenueGross').textContent = money(model.venue);
    $('kpiVenuePerSeat').textContent = `${money(ceil01(model.venue / inputs.seats))} / место`;
    $('kpiMarketing').textContent = money(model.marketing);
    $('kpiMarketingPerSeat').textContent = `${money(ceil01(model.marketing / inputs.seats))} / место`;
    $('kpiHotelling').textContent = money(model.hotelling);
    $('kpiHotellingPerSeat').textContent = `${money(ceil01(model.hotelling / inputs.seats))} / место`;
    $('kpiDynamicBreakEven').textContent = model.dynamicBreakEven === null ? 'нет решения' : money(model.dynamicBreakEven);
    $('kpiDynamicBreakEvenMeta').textContent = `при ${number(inputs.baseOccupancy, 0)}% загрузки, IVA ${percent(inputs.ticketIvaRate * 100)}, TM ${percent(inputs.tmRate * 100)}`;
    $('iterationStatus').textContent = model.converged
      ? `Hotelling: сходимость за ${model.iterations} ит.`
      : `Hotelling: лимит ${model.iterations} ит.`;

    const rows = [
      ['Аренда: всё включено + IVA 21%', model.venue],
      [`Агентство за ${inputs.daysToShow} дн.`, model.agencyPeriod],
      [`Digital за ${inputs.daysToShow} дн.`, model.digitalTotal],
      ['Гонорары за спектакль', model.showFees],
      ['Репетиции', model.rehearsals],
      ['Дополнительный пакет расходов', model.expensePackage],
      [`Hotelling ${percent(inputs.hotellingRate * 100)}`, model.hotelling],
      ['Формульная надбавка IN-03', model.adjustment],
    ];
    $('costBreakdownBody').innerHTML = rows.map(([label, value]) => `
      <tr><td>${label}</td><td class="numeric">${money(value)}</td><td class="numeric">${money(ceil01(value / inputs.seats))}</td></tr>`).join('');
    $('costBreakdownFoot').innerHTML = `
      <tr><td>Финальный brutto</td><td class="numeric">${money(model.finalGross)}</td><td class="numeric">${money(model.ticketPrice)}</td></tr>`;

    $('formulaDetails').innerHTML = [
      ['Direct до IN-03', money(model.direct)],
      ['IN-03', money(model.adjustment)],
      ['Финальный brutto', money(model.finalGross)],
      ['Вместимость', `${number(inputs.seats, 0)} мест`],
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

  function filteredScenarios() {
    const price = $('filterPrice').value;
    const occupancy = $('filterOccupancy').value;
    const result = $('filterResult').value;
    const id = $('filterId').value.trim().toLowerCase();
    return app.scenarios.filter((s) => {
      if (price !== 'all' && s.price !== Number(price)) return false;
      if (occupancy !== 'all' && s.occupancy !== Number(occupancy)) return false;
      if (result === 'positive' && !s.positive) return false;
      if (result === 'negative' && s.positive) return false;
      if (id && !s.id.toLowerCase().includes(id)) return false;
      return true;
    });
  }

  function renderTable() {
    const scenarios = filteredScenarios();
    $('scenarioCount').textContent = `Показано ${scenarios.length} из ${app.scenarios.length}`;
    const selected = selectedScenario();
    $('selectedScenarioLabel').textContent = selected
      ? `Текущий сценарий: ${selected.id} · ${money(selected.price)} · ${percent(selected.occupancy, 0)} · остаток ${money(selected.operatingBalance)}`
      : 'Текущий сценарий: —';
    $('scenarioTableBody').innerHTML = scenarios.map((s) => `
      <tr data-scenario-id="${s.id}" class="${s.id === app.selectedScenarioId ? 'selected ' : ''}${s.positive ? 'positive' : 'negative'}">
        <td><strong>${s.id}</strong></td>
        <td class="numeric">${money(s.price)}</td>
        <td class="numeric">${percent(s.occupancy, 0)}</td>
        <td class="numeric">${number(s.tickets, 0)}</td>
        <td class="numeric">${number(s.feeMultiplier, 2)}</td>
        <td class="numeric">${number(s.packageMultiplier, 2)}</td>
        <td class="numeric">${money(s.directCosts)}</td>
        <td class="numeric">${money(s.grossRevenue)}</td>
        <td class="numeric balance">${money(s.operatingBalance)}</td>
        <td class="numeric">${percent(s.margin)}</td>
        <td class="numeric">${number(s.mcdaMeanRank, 1)}</td>
      </tr>`).join('');
    document.querySelectorAll('#scenarioTableBody tr').forEach((row) => {
      row.addEventListener('click', () => selectScenario(row.dataset.scenarioId, true));
    });
  }

  function renderRecommendations() {
    const levels = [50, 65, 75, 90, 100];
    $('recommendationCards').innerHTML = levels.map((occupancy) => {
      const price = findBreakEvenPrice(app.inputs, app.model, occupancy, 1, 1);
      const guests = Math.round(app.inputs.seats * occupancy / 100);
      return `<article class="recommendation-card">
        <span>${occupancy}% · ${number(guests, 0)} гостей</span>
        <strong>${price === null ? '—' : money(price)}</strong>
        <small>минимальная динамическая цена</small>
      </article>`;
    }).join('');
  }

  function selectScenario(id, rerenderCharts = false) {
    if (!app.scenarios.some((s) => s.id === id)) return;
    app.selectedScenarioId = id;
    renderTable();
    if (rerenderCharts) renderCharts();
  }

  function downloadCsv() {
    const headers = ['ID', 'Цена', 'Загрузка_%', 'Гостей', 'Гонорар_множитель', 'Пакет_множитель', 'Прямые_расходы', 'Выручка_brutto', 'IVA_билета', 'Ticketmaster', 'Перечисление', 'Напитки', 'Операционный_остаток', 'Маржа_%', 'Запас_%', 'MCDA_средний_ранг', 'MCDA_std', 'MCDA_Top5_%'];
    const lines = [headers.join(';')];
    app.scenarios.forEach((s) => {
      lines.push([
        s.id, s.price, s.occupancy, s.tickets, s.feeMultiplier, s.packageMultiplier,
        s.directCosts, s.grossRevenue, s.ticketIva, s.tmCommission, s.remittance,
        s.beverageRevenue, s.operatingBalance, s.margin, s.safetyMargin,
        s.mcdaMeanRank, s.mcdaRankStd, s.mcdaTop5Rate,
      ].join(';'));
    });
    const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'stage-economics-scenarios.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function plot(id, traces, layout) {
    const div = $(`chart-${id}`);
    return Plotly.react(div, traces, layout, PLOT_CONFIG);
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
    const minPrice = Math.max(1, Math.min(model.ticketPrice, inputs.analysisBasePrice) * 0.55);
    const maxPrice = Math.max(model.dynamicBreakEven || 0, model.ticketPrice, inputs.analysisBasePrice) * 1.75;
    const xs = Array.from({ length: 80 }, (_, i) => ceil01(minPrice + (maxPrice - minPrice) * i / 79));
    const occupancies = [50, 75, 100];
    const traces = occupancies.map((occ) => ({
      type: 'scatter', mode: 'lines', name: `${occ}%`,
      x: xs, y: xs.map((p) => scenarioAt(inputs, model, p, occ).operatingBalance),
      hovertemplate: `Цена %{x:.1f} €<br>Остаток %{y:.1f} €<extra>${occ}%</extra>`,
    }));
    occupancies.forEach((occ) => {
      const be = findBreakEvenPrice(inputs, model, occ);
      if (be !== null) traces.push({
        type: 'scatter', mode: 'markers', name: `BE ${occ}%`, x: [be], y: [0],
        marker: { size: 9, symbol: 'x' }, hovertemplate: `${occ}%: %{x:.1f} €<extra></extra>`,
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
    return plot(2, [{
      type: 'heatmap', x: app.prices, y: OCCUPANCIES, z: baselineMatrix('safetyMargin'),
      colorscale: 'RdYlGn', zmid: 0, colorbar: { title: '%' },
      hovertemplate: 'Цена %{x:.1f} €<br>Загрузка %{y}%<br>Запас %{z:.1f}%<extra></extra>',
    }], basePlotLayout('Запас финансовой прочности', {
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
    return plot(4, [{
      type: 'heatmap', x: app.prices, y: OCCUPANCIES, z: baselineMatrix('operatingBalance'),
      colorscale: 'RdYlGn', zmid: 0, colorbar: { title: '€' },
      hovertemplate: 'Цена %{x:.1f} €<br>Загрузка %{y}%<br>Остаток %{z:.1f} €<extra></extra>',
    }], basePlotLayout('Операционный остаток: цена × загрузка', {
      xaxis: { title: 'Цена, €' }, yaxis: { title: 'Загрузка, %' },
      shapes: [zeroLine('y', 75, 'dash'), zeroLine('x', app.inputs.analysisBasePrice, 'dashdot')],
    }));
  }

  function priceSweep() {
    const max = Math.max(app.model.dynamicBreakEven || 0, app.inputs.analysisBasePrice, app.model.ticketPrice) * 1.8;
    return Array.from({ length: 90 }, (_, i) => ceil01(1 + (max - 1) * i / 89));
  }

  function renderChart5() {
    const xs = priceSweep();
    const net = xs.map((p) => p / (1 + app.inputs.ticketIvaRate) * (1 - app.inputs.tmRate));
    return plot(5, [
      { type: 'scatter', mode: 'lines', name: 'Перечисление', x: xs, y: net, hovertemplate: 'Цена %{x:.1f} €<br>Перечисление %{y:.2f} €<extra></extra>' },
      { type: 'scatter', mode: 'lines', name: 'Без комиссии y=x', x: xs, y: xs, line: { dash: 'dot' }, hoverinfo: 'skip' },
    ], basePlotLayout('Bruto-перечисление на билет', {
      xaxis: { title: 'Финальная цена, €' }, yaxis: { title: 'После IVA и TM, €' },
      shapes: [zeroLine('x', 35, 'dot'), zeroLine('x', app.inputs.analysisBasePrice, 'dashdot')],
    }));
  }

  function renderChart6() {
    const xs = priceSweep();
    const occ = app.inputs.baseOccupancy;
    const data = xs.map((p) => scenarioAt(app.inputs, app.model, p, occ));
    const perTicket = data.map((s) => s.adjustment / s.tickets);
    const share = data.map((s) => s.adjustment / Math.max(0.1, s.directCosts) * 100);
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
    const z = OCCUPANCIES.map((occ) => app.prices.map((price) => {
      const group = app.scenarios.filter((s) => s.price === price && s.occupancy === occ);
      return group.filter((s) => s.positive).length / group.length * 100;
    }));
    return plot(7, [{
      type: 'heatmap', x: app.prices, y: OCCUPANCIES, z, zmin: 0, zmax: 100,
      colorscale: 'RdYlGn', colorbar: { title: '%' },
      hovertemplate: 'Цена %{x:.1f} €<br>Загрузка %{y}%<br>Положительных %{z:.1f}%<extra></extra>',
    }], basePlotLayout('Доля положительных вариантов', {
      xaxis: { title: 'Цена, €' }, yaxis: { title: 'Загрузка, %' },
      shapes: [zeroLine('y', 75, 'dash')],
      annotations: [{ x: 1.02, xref: 'paper', y: 50, yref: 'y', text: '50%', showarrow: false }],
    }));
  }

  function renderChart8() {
    const s = selectedScenario();
    const t = s.tickets;
    const labels = ['Цена brutto', 'IVA билета', 'Ticketmaster', 'Аренда', 'Маркетинг', 'Артисты', 'Репетиции', 'Пакет', 'Hotelling', 'IN-03', 'Напиток', 'Остаток'];
    const values = [
      s.price,
      -s.ticketIva / t,
      -s.tmCommission / t,
      -s.venue / t,
      -s.marketing / t,
      -s.showFees / t,
      -s.rehearsals / t,
      -s.expensePackage / t,
      -s.hotelling / t,
      -s.adjustment / t,
      s.beverageRevenue / t,
      s.operatingBalance / t,
    ];
    const measure = ['absolute', ...Array(10).fill('relative'), 'total'];
    return plot(8, [{
      type: 'waterfall', x: labels, y: values, measure,
      connector: { line: { dash: 'dot' } },
      hovertemplate: '%{x}<br>%{y:.2f} €<extra></extra>',
    }], basePlotLayout(`Один билет · ${s.id}`, {
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
    const ranked = [...app.scenarios].sort((a, b) => b.margin - a.margin);
    const x = ranked.map((_, i) => i + 1);
    const y = ranked.map((s) => s.margin);
    const rolling = rollingMedian(y, 11);
    const selectedRank = ranked.findIndex((s) => s.id === app.selectedScenarioId) + 1;
    return plot(10, [
      { type: 'scattergl', mode: 'markers', name: 'Сценарии', x, y, customdata: ranked.map((s) => s.id), marker: { size: 7 }, hovertemplate: '%{customdata}<br>Ранг %{x}<br>Маржа %{y:.1f}%<extra></extra>' },
      { type: 'scatter', mode: 'lines', name: 'Rolling median', x, y: rolling, line: { width: 2.5 }, hovertemplate: 'Ранг %{x}<br>Медиана %{y:.1f}%<extra></extra>' },
    ], basePlotLayout('Рейтинг маржи', {
      xaxis: { title: 'Ранг по марже' }, yaxis: { title: 'Маржа, %' },
      shapes: [zeroLine('y'), zeroLine('x', 5, 'dot'), zeroLine('x', selectedRank, 'dashdot'), zeroLine('y', median(y), 'dash')],
    })).then(() => addClickSelection(10));
  }

  function packagePriceMeans() {
    return PACKAGE_MULTIPLIERS.map((pack) => app.prices.map((price) => mean(app.scenarios.filter((s) => s.packageMultiplier === pack && s.price === price).map((s) => s.operatingBalance))));
  }

  function renderChart11() {
    return plot(11, [{
      type: 'heatmap', x: app.prices, y: PACKAGE_MULTIPLIERS, z: packagePriceMeans(),
      colorscale: 'RdYlGn', zmid: 0, colorbar: { title: '€' },
      hovertemplate: 'Цена %{x:.1f} €<br>Пакет ×%{y:.2f}<br>Средний остаток %{z:.1f} €<extra></extra>',
    }], basePlotLayout('Пакет расходов × цена', {
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
    const iva = x.map((p) => p - p / (1 + app.inputs.ticketIvaRate));
    const tm = x.map((p, i) => (p - iva[i]) * app.inputs.tmRate);
    const remittance = x.map((p, i) => p - iva[i] - tm[i]);
    return plot(13, [
      { type: 'bar', name: 'IVA', x, y: iva },
      { type: 'bar', name: 'Ticketmaster', x, y: tm },
      { type: 'bar', name: 'Перечисление', x, y: remittance },
    ], basePlotLayout('Состав IVA и комиссии на билет', {
      barmode: 'stack', xaxis: { title: 'Цена, €' }, yaxis: { title: '€ / билет' },
      shapes: [zeroLine('x', app.inputs.analysisBasePrice, 'dashdot')],
      annotations: [{ x: 1, xref: 'paper', y: 1.08, yref: 'paper', text: `TM ${percent(app.inputs.tmRate * 100)}`, showarrow: false, xanchor: 'right' }],
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
    if (!window.Plotly || !app.scenarios.length) return;
    app.chartVersion += 1;
    for (let id = 1; id <= CHART_RENDERERS.length; id += 1) app.chartDirty.add(id);
    requestAnimationFrame(renderVisibleCharts);
  }

  function recalculate(forceCharts = false) {
    applyDependencies();
    const inputs = readInputs();
    validateInputs(inputs);
    const model = computeBaseModel(inputs);
    const generated = generateScenarios(inputs, model);
    app.inputs = inputs;
    app.model = model;
    app.scenarios = generated.scenarios;
    app.prices = generated.prices;
    if (!app.selectedScenarioId || !app.scenarios.some((s) => s.id === app.selectedScenarioId)) {
      app.selectedScenarioId = nearestScenario(app.scenarios, inputs).id;
    }
    saveState();
    renderSummary();
    populateFilters(app.prices);
    renderTable();
    renderRecommendations();
    if (forceCharts || inputs.autoUpdate) renderCharts();
  }

  let debounceTimer = null;
  function scheduleRecalculation() {
    applyDependencies();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => recalculate(false), 420);
  }

  function bindEvents() {
    document.querySelectorAll('.controls input, .controls select').forEach((el) => {
      el.addEventListener('input', scheduleRecalculation);
      el.addEventListener('change', scheduleRecalculation);
    });
    ['filterPrice', 'filterOccupancy', 'filterResult', 'filterId'].forEach((id) => {
      $(id).addEventListener(id === 'filterId' ? 'input' : 'change', renderTable);
    });
    $('recalculateBtn').addEventListener('click', () => recalculate(true));
    $('resetBtn').addEventListener('click', resetState);
    $('exportCsvTop').addEventListener('click', downloadCsv);
    $('exportCsvTable').addEventListener('click', downloadCsv);
    $('useFormulaPrice').addEventListener('click', () => {
      if (!app.model) return;
      $('analysisBasePrice').value = app.model.ticketPrice;
      recalculate(true);
    });
  }

  function init() {
    initChartsGrid();
    initCatalog();
    loadState();
    applyDependencies();
    bindEvents();
    recalculate(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
