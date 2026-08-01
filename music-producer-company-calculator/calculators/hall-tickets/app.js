(() => {
  "use strict";

  const APP_VERSION = "2.0.0";
  const STORAGE_KEYS = {
    autosave: "universalHallPricing.autosave.v2",
    projects: "universalHallPricing.projects.v2",
    halls: "universalHallPricing.halls.v2"
  };
  const VIRTUAL_THRESHOLD = 180;
  const CONFIG_ROW_HEIGHT = 58;
  const PRICING_ROW_HEIGHT = 58;
  const OVERSCAN = 8;
  const RECALC_DELAY = 160;
  const AUTOSAVE_DELAY = 650;

  const $ = id => document.getElementById(id);
  const appRoot = $("appRoot");

  function uid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `z_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  function parseLocaleNumber(value, fallback = 0) {
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    const normalized = String(value ?? "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/,/g, ".");
    if (!normalized) return fallback;
    const result = Number(normalized);
    return Number.isFinite(result) ? result : fallback;
  }

  function finiteNonNegative(value, fallback = 0) {
    const n = parseLocaleNumber(value, fallback);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  function finitePositive(value, fallback = 1) {
    const n = parseLocaleNumber(value, fallback);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function integerNonNegative(value, fallback = 0) {
    const n = parseLocaleNumber(value, fallback);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatInput(value, digits = 4) {
    if (!Number.isFinite(value)) return "0";
    const rounded = Number(value.toFixed(digits));
    return String(rounded).replace(".", ",");
  }

  function formatNumber(value, digits = 0) {
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(Number.isFinite(value) ? value : 0);
  }

  function formatEuro(value, digits = 2) {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(Number.isFinite(value) ? value : 0);
  }

  function formatPercent(value, digits = 1) {
    return `${formatNumber(value, digits)} %`;
  }

  function compactNumber(value, currency = false) {
    const abs = Math.abs(value);
    let divisor = 1;
    let suffix = "";
    if (abs >= 1e12) { divisor = 1e12; suffix = " трлн"; }
    else if (abs >= 1e9) { divisor = 1e9; suffix = " млрд"; }
    else if (abs >= 1e6) { divisor = 1e6; suffix = " млн"; }
    else if (abs >= 1e3) { divisor = 1e3; suffix = " тыс."; }
    const scaled = value / divisor;
    const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
    const text = formatNumber(scaled, digits) + suffix;
    return currency ? `${text} €` : text;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
  }

  function safeFilename(value) {
    const cleaned = String(value || "project")
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[=+\-@.]+/, "")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120);
    return cleaned || "project";
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function throttleFrame(fn) {
    let queued = false;
    return (...args) => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn(...args);
      });
    };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function createZone(index, total = 5, seats = 0) {
    return {
      id: uid(),
      label: `Зона ${index + 1}`,
      seats,
      priceIndex: total <= 1 ? 50 : 100 - (100 * index / (total - 1)),
      coefficient: 1,
      active: true,
      occupancy: 75,
      manualBase: 0,
      manualCustomer: 0
    };
  }

  function distributeSeats(total, count) {
    const base = count > 0 ? Math.floor(total / count) : 0;
    const remainder = count > 0 ? total - base * count : 0;
    return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
  }

  function makeDefaultZones(count = 5, capacity = 1000) {
    const seats = distributeSeats(capacity, count);
    return Array.from({ length: count }, (_, i) => createZone(i, count, seats[i]));
  }

  function defaultState() {
    return {
      version: APP_VERSION,
      projectName: "Новый проект",
      hall: {
        name: "Новый зал",
        capacity: 1000,
        capacityMode: "strict",
        oversellingEnabled: false,
        oversellPercent: 0
      },
      zones: makeDefaultZones(5, 1000),
      pricing: {
        model: "minmax",
        averageTarget: 80,
        averageScope: "base",
        grossTarget: 75000,
        grossMetric: "totalPaid",
        minimumPrice: 30,
        maximumPrice: 120,
        boundaryScope: "base",
        minimumOnly: 30,
        minimumScope: "base",
        maximumOnly: 120,
        maximumScope: "base",
        manualPriceMode: "base",
        singleZonePrice: 75,
        flatLevelPrice: 75,
        curveMode: "linear",
        powerExponent: 1.5,
        premiumRatio: 3.3,
        indexMode: "renormalize",
        allowPriceCrossing: false,
        roundingStep: 2,
        externalAdjustment: 0,
        buyerFee: 0,
        buyerFeeRetained: false,
        platformPercent: 0,
        platformFixed: 0
      },
      demand: {
        occupancyMode: "overall",
        overallOccupancy: 75,
        referenceOccupancy: 70,
        beta: 0.8,
        elasticityEnabled: false,
        elasticity: 0.6
      }
    };
  }

  let state = defaultState();
  let lastResult = null;
  let deletedZoneStack = [];
  let calculationErrors = [];
  let calculationWarnings = [];
  let pendingConfirm = null;
  let modalOpener = null;
  let autosaveTimer = null;
  let recalcTimer = null;
  let configWindow = { start: 0, end: 0 };
  let pricingWindow = { start: 0, end: 0 };

  function normalizeZone(zone, index, total) {
    const occupancyRaw = zone?.occupancy;
    return {
      id: typeof zone?.id === "string" && zone.id ? zone.id : uid(),
      label: String(zone?.label ?? `Зона ${index + 1}`),
      seats: integerNonNegative(zone?.seats, 0),
      priceIndex: Number.isFinite(parseLocaleNumber(zone?.priceIndex, NaN))
        ? parseLocaleNumber(zone.priceIndex, total <= 1 ? 50 : 100 - 100 * index / (total - 1))
        : total <= 1 ? 50 : 100 - 100 * index / (total - 1),
      coefficient: parseLocaleNumber(zone?.coefficient, 1),
      active: zone?.active !== false,
      occupancy: occupancyRaw === 0 || occupancyRaw === "0"
        ? 0
        : clamp(parseLocaleNumber(occupancyRaw, 75), 0, 100),
      manualBase: finiteNonNegative(zone?.manualBase, 0),
      manualCustomer: finiteNonNegative(zone?.manualCustomer, 0)
    };
  }

  function normalizeState(input) {
    const base = defaultState();
    const zonesInput = Array.isArray(input?.zones) && input.zones.length ? input.zones : base.zones;
    const normalized = {
      version: APP_VERSION,
      projectName: String(input?.projectName ?? base.projectName),
      hall: {
        ...base.hall,
        ...(input?.hall || {})
      },
      zones: zonesInput.map((z, i) => normalizeZone(z, i, zonesInput.length)),
      pricing: {
        ...base.pricing,
        ...(input?.pricing || {})
      },
      demand: {
        ...base.demand,
        ...(input?.demand || {})
      }
    };
    normalized.hall.capacity = integerNonNegative(normalized.hall.capacity, 1000);
    normalized.hall.oversellPercent = finiteNonNegative(normalized.hall.oversellPercent, 0);
    normalized.pricing.externalAdjustment = Math.max(-100, parseLocaleNumber(normalized.pricing.externalAdjustment, 0));
    normalized.pricing.roundingStep = finitePositive(normalized.pricing.roundingStep, 2);
    normalized.pricing.premiumRatio = finitePositive(normalized.pricing.premiumRatio, 3.3);
    normalized.pricing.powerExponent = finitePositive(normalized.pricing.powerExponent, 1.5);
    normalized.pricing.buyerFee = finiteNonNegative(normalized.pricing.buyerFee, 0);
    normalized.pricing.platformPercent = finiteNonNegative(normalized.pricing.platformPercent, 0);
    normalized.pricing.platformFixed = finiteNonNegative(normalized.pricing.platformFixed, 0);
    normalized.demand.overallOccupancy = clamp(parseLocaleNumber(normalized.demand.overallOccupancy, 75), 0, 100);
    normalized.demand.referenceOccupancy = clamp(parseLocaleNumber(normalized.demand.referenceOccupancy, 70), 0, 100);
    normalized.demand.beta = finiteNonNegative(normalized.demand.beta, 0.8);
    normalized.demand.elasticity = finiteNonNegative(normalized.demand.elasticity, 0.6);
    return normalized;
  }

  function showToast(message, duration = 2600) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("hidden"), duration);
  }

  function setStorageMessage(message, type = "info") {
    const el = $("storageMessage");
    el.textContent = message;
    el.className = `inline-message ${type === "error" ? "error" : type === "warning" ? "warning" : ""}`;
    el.classList.toggle("hidden", !message);
  }

  function storageRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      $("autosaveStatus").textContent = "Автосохранение недоступно";
      $("autosaveStatus").className = "status-chip error";
      setStorageMessage(`Браузер не разрешил чтение локального хранилища: ${error.message}`, "error");
      return fallback;
    }
  }

  function storageWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      $("autosaveStatus").textContent = "Ошибка автосохранения";
      $("autosaveStatus").className = "status-chip error";
      setStorageMessage(`Не удалось сохранить данные в браузере: ${error.message}. Используйте экспорт JSON.`, "error");
      return false;
    }
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    $("autosaveStatus").textContent = "Автосохранение: изменения";
    $("autosaveStatus").className = "status-chip";
    autosaveTimer = setTimeout(() => {
      if (storageWrite(STORAGE_KEYS.autosave, state)) {
        $("autosaveStatus").textContent = `Автосохранено ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
        $("autosaveStatus").className = "status-chip ok";
      }
    }, AUTOSAVE_DELAY);
  }

  function getFocusable(container) {
    return [...container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.closest(".hidden") && el.offsetParent !== null);
  }

  function openModal(modalId, opener = document.activeElement) {
    const modal = $(modalId);
    modalOpener = opener;
    appRoot.inert = true;
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    const focusable = getFocusable(modal);
    (focusable[0] || modal).focus();
  }

  function closeModal(modalId) {
    const modal = $(modalId);
    modal.classList.add("hidden");
    appRoot.inert = false;
    document.body.classList.remove("modal-open");
    if (modalOpener instanceof HTMLElement) modalOpener.focus();
    modalOpener = null;
  }

  function trapFocus(event, modal) {
    if (event.key !== "Tab") return;
    const focusable = getFocusable(modal);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function askConfirmation(message, onConfirm) {
    $("confirmMessage").textContent = message;
    pendingConfirm = onConfirm;
    openModal("confirmModal");
  }

  function activeZoneIndices() {
    const result = [];
    for (let i = 0; i < state.zones.length; i += 1) {
      if (state.zones[i].active) result.push(i);
    }
    return result;
  }

  function zoneOccupancy(zone) {
    return state.demand.occupancyMode === "overall"
      ? clamp(state.demand.overallOccupancy, 0, 100)
      : clamp(zone.occupancy, 0, 100);
  }

  function hallDistributedCapacity() {
    return state.zones.reduce((sum, zone) => sum + integerNonNegative(zone.seats, 0), 0);
  }

  function oversellMultiplier() {
    return state.hall.oversellingEnabled ? 1 + finiteNonNegative(state.hall.oversellPercent, 0) / 100 : 1;
  }

  function zoneSellableSeats(zone) {
    return integerNonNegative(zone.seats, 0) * oversellMultiplier();
  }

  function allocateSellableSeats(ids) {
    const output = new Array(state.zones.length).fill(0);
    if (!ids.length) return output;
    const exact = ids.map(i => zoneSellableSeats(state.zones[i]));
    const floors = exact.map(value => Math.floor(Math.max(0, value)));
    let remaining = Math.max(0, Math.round(exact.reduce((sum, value) => sum + value, 0)) - floors.reduce((sum, value) => sum + value, 0));
    const order = exact.map((value, localIndex) => ({
      localIndex,
      fraction: Math.max(0, value) - Math.floor(Math.max(0, value))
    })).sort((a, b) => b.fraction - a.fraction || a.localIndex - b.localIndex);
    for (const item of order) {
      if (remaining <= 0) break;
      floors[item.localIndex] += 1;
      remaining -= 1;
    }
    ids.forEach((zoneIndex, localIndex) => { output[zoneIndex] = floors[localIndex]; });
    return output;
  }

  function capacityIsValid() {
    return state.hall.capacityMode === "free" || hallDistributedCapacity() === integerNonNegative(state.hall.capacity, 0);
  }

  function priceLevelData(ids) {
    const pricing = state.pricing;
    const rawValues = ids.map(i => pricing.curveMode === "manualCoefficient"
      ? parseLocaleNumber(state.zones[i].coefficient, 0)
      : parseLocaleNumber(state.zones[i].priceIndex, 0));
    const allFinite = rawValues.every(Number.isFinite);
    const min = allFinite && rawValues.length ? Math.min(...rawValues) : 0;
    const max = allFinite && rawValues.length ? Math.max(...rawValues) : 0;
    const span = max - min;
    const sameLevel = ids.length > 1 && Math.abs(span) < 1e-12;
    const t = new Array(state.zones.length).fill(0.5);

    ids.forEach((zoneIndex, position) => {
      const raw = rawValues[position];
      if (pricing.curveMode === "manualCoefficient") {
        t[zoneIndex] = span > 0 ? (raw - min) / span : 0.5;
      } else if (pricing.indexMode === "renormalize") {
        t[zoneIndex] = span > 0 ? (raw - min) / span : 0.5;
      } else {
        t[zoneIndex] = clamp(raw / 100, 0, 1);
      }
    });

    return { t, rawValues, min, max, span, sameLevel, allFinite };
  }

  function curveFactor(t, zoneIndex) {
    const pricing = state.pricing;
    const ratio = finitePositive(pricing.premiumRatio, 1);
    if (pricing.curveMode === "manualCoefficient") {
      const coefficient = parseLocaleNumber(state.zones[zoneIndex].coefficient, 0);
      return coefficient > 0 ? coefficient : 0;
    }
    if (pricing.curveMode === "geometric") return Math.pow(ratio, t);
    if (pricing.curveMode === "power") {
      const exponent = finitePositive(pricing.powerExponent, 1);
      return 1 + (ratio - 1) * Math.pow(t, exponent);
    }
    return 1 + (ratio - 1) * t;
  }

  function minMaxDesired(minimum, maximum, t, zoneIndex, levelData) {
    const pricing = state.pricing;
    if (pricing.curveMode === "manualCoefficient") {
      const localT = levelData.span > 0
        ? (parseLocaleNumber(state.zones[zoneIndex].coefficient, 0) - levelData.min) / levelData.span
        : 0.5;
      return minimum + (maximum - minimum) * localT;
    }
    if (pricing.curveMode === "geometric" && minimum > 0 && maximum > 0) {
      return minimum * Math.pow(maximum / minimum, t);
    }
    if (pricing.curveMode === "power") {
      const exponent = finitePositive(pricing.powerExponent, 1);
      return minimum + (maximum - minimum) * Math.pow(t, exponent);
    }
    return minimum + (maximum - minimum) * t;
  }

  function rounding(value) {
    const step = finitePositive(state.pricing.roundingStep, 1);
    return Math.round(value / step) * step;
  }

  function dynamicFactor(occupancyShare) {
    const exponent = finiteNonNegative(state.demand.beta, 0) * (occupancyShare - clamp(state.demand.referenceOccupancy, 0, 100) / 100);
    if (exponent > 709) return Number.POSITIVE_INFINITY;
    if (exponent < -745) return 0;
    return Math.exp(exponent);
  }

  function monotonicRegression(items) {
    if (state.pricing.allowPriceCrossing || items.length < 2) return items.map(item => item.value);
    const sorted = items
      .map((item, index) => ({ ...item, originalIndex: index }))
      .sort((a, b) => a.t - b.t || a.originalIndex - b.originalIndex);
    const blocks = [];
    for (const item of sorted) {
      blocks.push({
        start: blocks.length,
        values: [item],
        weight: Math.max(item.weight, 1e-9),
        mean: item.value
      });
      while (blocks.length >= 2) {
        const b = blocks[blocks.length - 1];
        const a = blocks[blocks.length - 2];
        if (a.mean <= b.mean + 1e-12) break;
        const weight = a.weight + b.weight;
        const merged = {
          start: a.start,
          values: a.values.concat(b.values),
          weight,
          mean: (a.mean * a.weight + b.mean * b.weight) / weight
        };
        blocks.splice(blocks.length - 2, 2, merged);
      }
    }
    const output = new Array(items.length);
    for (const block of blocks) {
      for (const item of block.values) output[item.originalIndex] = block.mean;
    }
    return output;
  }

  function largestRemainderAllocation(exactValues, maximums) {
    const floors = exactValues.map((value, i) => Math.min(Math.floor(Math.max(0, value)), Math.floor(maximums[i])));
    const target = Math.min(
      Math.round(exactValues.reduce((sum, value) => sum + Math.max(0, value), 0)),
      Math.floor(maximums.reduce((sum, value) => sum + Math.max(0, value), 0))
    );
    let remaining = target - floors.reduce((sum, value) => sum + value, 0);
    const order = exactValues
      .map((value, i) => ({ i, fraction: Math.max(0, value) - Math.floor(Math.max(0, value)) }))
      .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
    for (const item of order) {
      if (remaining <= 0) break;
      if (floors[item.i] < Math.floor(maximums[item.i])) {
        floors[item.i] += 1;
        remaining -= 1;
      }
    }
    if (remaining > 0) {
      for (let i = 0; i < floors.length && remaining > 0; i += 1) {
        const room = Math.floor(maximums[i]) - floors[i];
        const add = Math.min(room, remaining);
        floors[i] += add;
        remaining -= add;
      }
    }
    return floors;
  }

  function computeMetrics(rows) {
    const ticketRevenue = rows.reduce((sum, row) => sum + row.ticketPrice * row.sold, 0);
    const buyerFees = rows.reduce((sum, row) => sum + row.buyerFee * row.sold, 0);
    const totalPaid = ticketRevenue + buyerFees;
    const platformCommission = rows.reduce((sum, row) => {
      return sum + row.ticketPrice * row.sold * finiteNonNegative(state.pricing.platformPercent, 0) / 100
        + row.sold * finiteNonNegative(state.pricing.platformFixed, 0);
    }, 0);
    const organizer = ticketRevenue
      + (state.pricing.buyerFeeRetained ? buyerFees : 0)
      - platformCommission;
    const sold = rows.reduce((sum, row) => sum + row.sold, 0);
    const activeSellableCapacity = rows.reduce((sum, row) => sum + row.sellableSeats, 0);
    return {
      sold,
      ticketRevenue,
      buyerFees,
      totalPaid,
      platformCommission,
      organizer,
      averageCustomerPrice: sold > 0 ? totalPaid / sold : 0,
      activeSellableCapacity
    };
  }

  function metricValue(metrics, key) {
    if (key === "ticketRevenue") return metrics.ticketRevenue;
    if (key === "organizer") return metrics.organizer;
    if (key === "averageCustomerPrice") return metrics.averageCustomerPrice;
    return metrics.totalPaid;
  }

  function evaluateBasePrices(basePrices, ids, levelData, options = {}) {
    const sellableAllocation = options.sellableAllocation || allocateSellableSeats(ids);
    const includeExternal = options.includeExternal !== false;
    const externalMultiplier = includeExternal
      ? Math.max(0, 1 + Math.max(-100, parseLocaleNumber(state.pricing.externalAdjustment, 0)) / 100)
      : 1;
    const buyerFee = finiteNonNegative(state.pricing.buyerFee, 0);
    const baselineShares = ids.map(i => zoneOccupancy(state.zones[i]) / 100);
    let demandShares = baselineShares.slice();
    let finalRows = [];
    const elasticityEnabled = state.demand.elasticityEnabled;
    const elasticity = finiteNonNegative(state.demand.elasticity, 0);
    const iterations = elasticityEnabled ? 12 : 1;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const rawRows = ids.map((zoneIndex, localIndex) => {
        const zone = state.zones[zoneIndex];
        const factor = dynamicFactor(demandShares[localIndex]);
        const rawTicket = basePrices[zoneIndex] * factor * externalMultiplier;
        const roundedTicket = rounding(Math.max(0, rawTicket));
        return {
          zoneIndex,
          t: levelData.t[zoneIndex],
          basePrice: basePrices[zoneIndex],
          demandFactor: factor,
          ticketPrice: roundedTicket,
          customerPrice: roundedTicket + buyerFee,
          buyerFee,
          baselineShare: baselineShares[localIndex],
          demandShare: demandShares[localIndex],
          sellableSeats: sellableAllocation[zoneIndex] || 0,
          weight: Math.max((sellableAllocation[zoneIndex] || 0) * Math.max(demandShares[localIndex], 0.01), 1)
        };
      });

      const adjustedCustomers = monotonicRegression(rawRows.map(row => ({
        value: row.customerPrice,
        t: row.t,
        weight: row.weight
      })));

      rawRows.forEach((row, i) => {
        if (!state.pricing.allowPriceCrossing) {
          row.customerPrice = Math.max(buyerFee, adjustedCustomers[i]);
          row.ticketPrice = rounding(Math.max(0, row.customerPrice - buyerFee));
          row.customerPrice = row.ticketPrice + buyerFee;
        }
      });

      finalRows = rawRows;
      if (!elasticityEnabled || elasticity === 0) break;

      let maxChange = 0;
      demandShares = rawRows.map((row, localIndex) => {
        const referenceCustomer = Math.max(basePrices[row.zoneIndex] + buyerFee, 1e-9);
        const ratio = row.customerPrice <= 0 ? 1e-9 : row.customerPrice / referenceCustomer;
        let desired = baselineShares[localIndex] * Math.pow(ratio, -elasticity);
        if (!Number.isFinite(desired)) desired = ratio < 1 ? 1 : 0;
        desired = clamp(desired, 0, 1);
        const damped = demandShares[localIndex] * 0.45 + desired * 0.55;
        maxChange = Math.max(maxChange, Math.abs(damped - demandShares[localIndex]));
        return damped;
      });
      if (maxChange < 1e-5) break;
    }

    const exactSales = finalRows.map(row => row.sellableSeats * row.demandShare);
    const maximums = finalRows.map(row => row.sellableSeats);
    const soldValues = largestRemainderAllocation(exactSales, maximums);
    finalRows.forEach((row, i) => {
      row.exactSales = exactSales[i];
      row.sold = soldValues[i];
      row.zoneRevenue = row.customerPrice * row.sold;
    });
    return {
      rows: finalRows,
      metrics: computeMetrics(finalRows)
    };
  }

  function invertDesiredCustomerPrices(desiredCustomers, ids, levelData, includeExternal = true) {
    const buyerFee = finiteNonNegative(state.pricing.buyerFee, 0);
    const externalMultiplier = includeExternal
      ? Math.max(0, 1 + Math.max(-100, parseLocaleNumber(state.pricing.externalAdjustment, 0)) / 100)
      : 1;
    const base = new Array(state.zones.length).fill(0);
    ids.forEach(i => {
      const occ = zoneOccupancy(state.zones[i]) / 100;
      const factor = dynamicFactor(occ);
      const denominator = factor * externalMultiplier;
      const desiredTicket = Math.max(0, desiredCustomers[i] - buyerFee);
      base[i] = denominator > 0 && Number.isFinite(denominator) ? desiredTicket / denominator : 0;
    });
    return base;
  }

  function averageBaseScale(ids, factors, target) {
    let weight = 0;
    let weightedFactor = 0;
    ids.forEach(i => {
      const seats = integerNonNegative(state.zones[i].seats, 0);
      weight += seats;
      weightedFactor += seats * factors[i];
    });
    return weightedFactor > 0 ? target * weight / weightedFactor : 0;
  }

  function solveScale(ids, levelData, factors, target, metricKey, includeExternal, sellableAllocation) {
    let evaluations = 0;
    let overflow = false;
    let nonMonotonic = false;
    const cache = new Map();

    const evaluate = scale => {
      const safeScale = Math.max(0, scale);
      const cacheKey = safeScale.toPrecision(14);
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      const base = new Array(state.zones.length).fill(0);
      ids.forEach(i => { base[i] = factors[i] * safeScale; });
      const result = evaluateBasePrices(base, ids, levelData, { includeExternal, sellableAllocation });
      const metric = metricValue(result.metrics, metricKey);
      const record = { scale: safeScale, metric, result };
      cache.set(cacheKey, record);
      evaluations += 1;
      if (!Number.isFinite(metric)) overflow = true;
      return record;
    };

    const zero = evaluate(0);
    if (!Number.isFinite(target) || target <= zero.metric) {
      return {
        scale: 0,
        result: zero.result,
        achieved: zero.metric,
        minimum: zero.metric,
        evaluations,
        overflow,
        nonMonotonic,
        targetBelowMinimum: target < zero.metric - 1e-8
      };
    }

    const one = evaluate(1);
    if (zero.result.metrics.sold === 0 && one.result.metrics.sold === 0) {
      calculationErrors.push("При текущей заполняемости нет ожидаемых продаж, поэтому положительная целевая сумма недостижима.");
      return {
        scale: 0, result: zero.result, achieved: zero.metric, minimum: zero.metric,
        evaluations, overflow, nonMonotonic, targetBelowMinimum: false
      };
    }
    let slope = one.metric - zero.metric;
    let estimate = slope > 0 && Number.isFinite(slope) ? (target - zero.metric) / slope : 1;
    if (!Number.isFinite(estimate) || estimate <= 0) estimate = 1;

    let low = zero;
    let high = evaluate(Math.max(estimate * 1.15, 1));
    let previous = one;
    let expansions = 0;

    while (Number.isFinite(high.metric) && high.metric < target && expansions < 64) {
      if (high.metric + 1e-9 < previous.metric) nonMonotonic = true;
      previous = high;
      low = high;
      const nextScale = high.scale > 0 ? high.scale * 2 : 1;
      high = evaluate(nextScale);
      expansions += 1;
    }

    if (!Number.isFinite(high.metric)) {
      overflow = true;
    }

    if (nonMonotonic || state.demand.elasticityEnabled && finiteNonNegative(state.demand.elasticity, 0) > 1) {
      calculationWarnings.push("При высокой эластичности целевая функция может быть немонотонной. Выбрано ближайшее найденное решение.");
      const center = Math.max(estimate, 1e-12);
      const candidates = [zero, one, low, high].filter(Boolean);
      for (let k = -14; k <= 14; k += 1) {
        const scale = center * Math.pow(2, k / 2);
        candidates.push(evaluate(scale));
      }
      const finiteCandidates = candidates.filter(item => Number.isFinite(item.metric));
      const best = finiteCandidates.reduce((current, item) => {
        return Math.abs(item.metric - target) < Math.abs(current.metric - target) ? item : current;
      }, finiteCandidates[0] || zero);
      return {
        scale: best.scale,
        result: best.result,
        achieved: best.metric,
        minimum: zero.metric,
        evaluations,
        overflow,
        nonMonotonic: true,
        targetBelowMinimum: false
      };
    }

    if (high.metric < target && Number.isFinite(high.metric)) {
      calculationErrors.push("Не удалось найти цену, достигающую целевой суммы. Проверьте комиссии, эластичность и активные зоны.");
      return {
        scale: high.scale,
        result: high.result,
        achieved: high.metric,
        minimum: zero.metric,
        evaluations,
        overflow,
        nonMonotonic,
        targetBelowMinimum: false
      };
    }

    let best = Math.abs(low.metric - target) <= Math.abs(high.metric - target) ? low : high;
    for (let iteration = 0; iteration < 28; iteration += 1) {
      const middleScale = (low.scale + high.scale) / 2;
      if (middleScale === low.scale || middleScale === high.scale) break;
      const middle = evaluate(middleScale);
      if (!Number.isFinite(middle.metric)) {
        high = middle;
        overflow = true;
        continue;
      }
      if (Math.abs(middle.metric - target) < Math.abs(best.metric - target)) best = middle;
      if (middle.metric < target) low = middle;
      else high = middle;
      const tolerance = Math.max(0.01, Math.abs(target) * 1e-8);
      if (Math.abs(best.metric - target) <= tolerance) break;
    }

    for (const item of [low, high]) {
      if (Number.isFinite(item.metric) && Math.abs(item.metric - target) < Math.abs(best.metric - target)) best = item;
    }

    return {
      scale: best.scale,
      result: best.result,
      achieved: best.metric,
      minimum: zero.metric,
      evaluations,
      overflow,
      nonMonotonic,
      targetBelowMinimum: false
    };
  }

  function evaluateManualCustomer(ids, levelData, sellableAllocation) {
    const buyerFee = finiteNonNegative(state.pricing.buyerFee, 0);
    const rows = ids.map(i => {
      const zone = state.zones[i];
      const customerPrice = finiteNonNegative(zone.manualCustomer, 0);
      const ticketPrice = Math.max(0, customerPrice - buyerFee);
      const share = zoneOccupancy(zone) / 100;
      return {
        zoneIndex: i,
        t: levelData.t[i],
        basePrice: ticketPrice,
        demandFactor: 1,
        ticketPrice,
        buyerFee: Math.min(buyerFee, customerPrice),
        customerPrice,
        baselineShare: share,
        demandShare: share,
        sellableSeats: sellableAllocation[i] || 0,
        weight: Math.max((sellableAllocation[i] || 0) * Math.max(share, 0.01), 1)
      };
    });

    // В режиме ручной окончательной цены введённое значение является приоритетным.
    // Программа не изменяет его автоматически; возможные пересечения показываются предупреждением.
    if (state.demand.elasticityEnabled && finiteNonNegative(state.demand.elasticity, 0) > 0) {
      const elasticity = finiteNonNegative(state.demand.elasticity, 0);
      rows.forEach(row => {
        const zone = state.zones[row.zoneIndex];
        const reference = zone.manualBase + buyerFee > 0 ? zone.manualBase + buyerFee : Math.max(row.customerPrice, 1e-9);
        const ratio = row.customerPrice <= 0 ? 1e-9 : row.customerPrice / reference;
        let adjusted = row.baselineShare * Math.pow(ratio, -elasticity);
        if (!Number.isFinite(adjusted)) adjusted = ratio < 1 ? 1 : 0;
        row.demandShare = clamp(adjusted, 0, 1);
      });
    }

    const exact = rows.map(row => row.sellableSeats * row.demandShare);
    const sold = largestRemainderAllocation(exact, rows.map(row => row.sellableSeats));
    rows.forEach((row, i) => {
      row.exactSales = exact[i];
      row.sold = sold[i];
      row.zoneRevenue = row.customerPrice * row.sold;
    });
    return { rows, metrics: computeMetrics(rows) };
  }

  function calculateScenario() {
    calculationErrors = [];
    calculationWarnings = [];
    const ids = activeZoneIndices();
    const sellableAllocation = allocateSellableSeats(ids);
    const levelData = priceLevelData(ids);
    const emptyResult = {
      valid: false,
      rows: [],
      byId: new Map(),
      metrics: computeMetrics([]),
      target: null,
      errors: calculationErrors,
      warnings: calculationWarnings,
      levelData
    };

    if (!capacityIsValid()) {
      calculationErrors.push("В строгом режиме сумма мест по зонам должна точно совпадать с вместимостью зала.");
      return emptyResult;
    }
    if (!ids.length) {
      calculationWarnings.push("Все зоны отключены.");
      return { ...emptyResult, valid: true };
    }
    if (!levelData.allFinite) calculationErrors.push("В ценовых индексах или коэффициентах есть некорректные значения.");
    if (state.pricing.curveMode === "manualCoefficient") {
      const invalid = ids.some(i => !(parseLocaleNumber(state.zones[i].coefficient, 0) > 0));
      if (invalid) calculationErrors.push("Ручные ценовые коэффициенты активных зон должны быть больше нуля.");
    }
    if (finitePositive(state.pricing.roundingStep, 0) <= 0) calculationErrors.push("Шаг округления должен быть больше нуля.");
    if (state.pricing.externalAdjustment < -100) calculationErrors.push("Скидка не может быть ниже −100%.");
    if (calculationErrors.length) return emptyResult;

    const pricing = state.pricing;
    const factors = new Array(state.zones.length).fill(0);
    ids.forEach(i => { factors[i] = curveFactor(levelData.t[i], i); });
    const model = pricing.model;
    let basePrices = new Array(state.zones.length).fill(0);
    let preExternal = null;
    let finalEvaluation = null;
    let targetInfo = null;

    const singleOverride = ids.length === 1 && ["minmax", "minimum", "maximum"].includes(model);
    const flatOverride = levelData.sameLevel && ["minmax", "minimum", "maximum"].includes(model);

    if (model === "manual") {
      if (pricing.manualPriceMode === "customer") {
        finalEvaluation = evaluateManualCustomer(ids, levelData, sellableAllocation);
      } else {
        ids.forEach(i => { basePrices[i] = finiteNonNegative(state.zones[i].manualBase, 0); });
        finalEvaluation = evaluateBasePrices(basePrices, ids, levelData, { includeExternal: true, sellableAllocation });
      }
    } else if (singleOverride || flatOverride) {
      const price = singleOverride
        ? finiteNonNegative(pricing.singleZonePrice, 0)
        : finiteNonNegative(pricing.flatLevelPrice, 0);
      const scope = model === "minmax" ? pricing.boundaryScope : model === "minimum" ? pricing.minimumScope : pricing.maximumScope;
      const desired = new Array(state.zones.length).fill(0);
      ids.forEach(i => { desired[i] = price; });
      basePrices = scope === "customer"
        ? invertDesiredCustomerPrices(desired, ids, levelData, true)
        : desired;
      finalEvaluation = evaluateBasePrices(basePrices, ids, levelData, { includeExternal: true, sellableAllocation });
    } else if (model === "minmax") {
      const minimum = finiteNonNegative(pricing.minimumPrice, 0);
      const maximum = finiteNonNegative(pricing.maximumPrice, 0);
      if (minimum > maximum) calculationWarnings.push("Минимальная цена выше максимальной: ценовая лестница инвертирована.");
      const desired = new Array(state.zones.length).fill(0);
      ids.forEach(i => { desired[i] = minMaxDesired(minimum, maximum, levelData.t[i], i, levelData); });
      basePrices = pricing.boundaryScope === "customer"
        ? invertDesiredCustomerPrices(desired, ids, levelData, true)
        : desired;
      finalEvaluation = evaluateBasePrices(basePrices, ids, levelData, { includeExternal: true, sellableAllocation });
    } else if (model === "minimum") {
      const minimum = finiteNonNegative(pricing.minimumOnly, 0);
      let denominator = 1;
      if (pricing.curveMode === "manualCoefficient") {
        denominator = Math.min(...ids.map(i => factors[i]));
      }
      const desired = new Array(state.zones.length).fill(0);
      ids.forEach(i => { desired[i] = minimum * (denominator > 0 ? factors[i] / denominator : 0); });
      basePrices = pricing.minimumScope === "customer"
        ? invertDesiredCustomerPrices(desired, ids, levelData, true)
        : desired;
      finalEvaluation = evaluateBasePrices(basePrices, ids, levelData, { includeExternal: true, sellableAllocation });
    } else if (model === "maximum") {
      const maximum = finiteNonNegative(pricing.maximumOnly, 0);
      let denominator;
      if (pricing.curveMode === "manualCoefficient") denominator = Math.max(...ids.map(i => factors[i]));
      else denominator = finitePositive(pricing.premiumRatio, 1);
      const desired = new Array(state.zones.length).fill(0);
      ids.forEach(i => { desired[i] = maximum * (denominator > 0 ? factors[i] / denominator : 0); });
      basePrices = pricing.maximumScope === "customer"
        ? invertDesiredCustomerPrices(desired, ids, levelData, true)
        : desired;
      finalEvaluation = evaluateBasePrices(basePrices, ids, levelData, { includeExternal: true, sellableAllocation });
    } else if (model === "average") {
      const target = finiteNonNegative(pricing.averageTarget, 0);
      if (pricing.averageScope === "base") {
        const scale = averageBaseScale(ids, factors, target);
        ids.forEach(i => { basePrices[i] = factors[i] * scale; });
        finalEvaluation = evaluateBasePrices(basePrices, ids, levelData, { includeExternal: true, sellableAllocation });
      } else {
        const solved = solveScale(ids, levelData, factors, target, "averageCustomerPrice", true, sellableAllocation);
        finalEvaluation = solved.result;
        ids.forEach(i => { basePrices[i] = factors[i] * solved.scale; });
        targetInfo = {
          requested: target,
          achieved: solved.achieved,
          minimum: solved.minimum,
          final: solved.achieved,
          metric: "averageCustomerPrice",
          evaluations: solved.evaluations,
          overflow: solved.overflow,
          targetBelowMinimum: solved.targetBelowMinimum
        };
      }
    } else if (model === "gross") {
      const target = finiteNonNegative(pricing.grossTarget, 0);
      const metricKey = pricing.grossMetric;
      const solved = solveScale(ids, levelData, factors, target, metricKey, false, sellableAllocation);
      preExternal = solved.result;
      ids.forEach(i => { basePrices[i] = factors[i] * solved.scale; });
      finalEvaluation = evaluateBasePrices(basePrices, ids, levelData, { includeExternal: true, sellableAllocation });
      targetInfo = {
        requested: target,
        achieved: solved.achieved,
        minimum: solved.minimum,
        final: metricValue(finalEvaluation.metrics, metricKey),
        metric: metricKey,
        evaluations: solved.evaluations,
        overflow: solved.overflow,
        nonMonotonic: solved.nonMonotonic,
        targetBelowMinimum: solved.targetBelowMinimum
      };
      if (solved.targetBelowMinimum) {
        calculationWarnings.push(`Цель ниже минимально достижимой суммы ${formatEuro(solved.minimum, 2)}. Базовые цены установлены в ноль.`);
      }
      if (solved.overflow) calculationWarnings.push("Во время поиска цены обнаружено числовое переполнение. Использовано ближайшее конечное решение.");
    }

    if (!finalEvaluation) return emptyResult;

    const rows = finalEvaluation.rows.map(row => ({
      ...row,
      zone: state.zones[row.zoneIndex]
    }));
    const byId = new Map(rows.map(row => [row.zone.id, row]));

    const sorted = rows.slice().sort((a, b) => a.t - b.t);
    let inversion = false;
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].customerPrice + 1e-8 < sorted[i - 1].customerPrice) inversion = true;
    }
    if (inversion && (pricing.allowPriceCrossing || model === "manual" && pricing.manualPriceMode === "customer")) {
      calculationWarnings.push("Итоговая ценовая лестница содержит пересечения: более дорогая по индексу зона стала дешевле другой зоны.");
    }
    if (levelData.sameLevel) calculationWarnings.push("Все активные зоны имеют одинаковый ценовой уровень.");

    return {
      valid: true,
      rows,
      byId,
      metrics: finalEvaluation.metrics,
      preExternalMetrics: preExternal?.metrics || null,
      target: targetInfo,
      basePrices,
      errors: calculationErrors.slice(),
      warnings: calculationWarnings.slice(),
      levelData
    };
  }

  const controlBindings = {
    projectName: ["projectName", "string"],
    hallName: ["hall.name", "string"],
    hallCapacity: ["hall.capacity", "integer"],
    capacityMode: ["hall.capacityMode", "string"],
    oversellingEnabled: ["hall.oversellingEnabled", "boolean"],
    oversellPercent: ["hall.oversellPercent", "nonnegative"],
    pricingModel: ["pricing.model", "string"],
    averageTarget: ["pricing.averageTarget", "nonnegative"],
    averageScope: ["pricing.averageScope", "string"],
    grossTarget: ["pricing.grossTarget", "nonnegative"],
    grossMetric: ["pricing.grossMetric", "string"],
    minimumPrice: ["pricing.minimumPrice", "nonnegative"],
    maximumPrice: ["pricing.maximumPrice", "nonnegative"],
    boundaryScope: ["pricing.boundaryScope", "string"],
    minimumOnly: ["pricing.minimumOnly", "nonnegative"],
    minimumScope: ["pricing.minimumScope", "string"],
    maximumOnly: ["pricing.maximumOnly", "nonnegative"],
    maximumScope: ["pricing.maximumScope", "string"],
    manualPriceMode: ["pricing.manualPriceMode", "string"],
    singleZonePrice: ["pricing.singleZonePrice", "nonnegative"],
    flatLevelPrice: ["pricing.flatLevelPrice", "nonnegative"],
    curveMode: ["pricing.curveMode", "string"],
    powerExponent: ["pricing.powerExponent", "positive"],
    premiumRatio: ["pricing.premiumRatio", "positive"],
    indexMode: ["pricing.indexMode", "string"],
    allowPriceCrossing: ["pricing.allowPriceCrossing", "boolean"],
    overallOccupancy: ["demand.overallOccupancy", "occupancy"],
    referenceOccupancy: ["demand.referenceOccupancy", "occupancy"],
    beta: ["demand.beta", "nonnegative"],
    elasticityEnabled: ["demand.elasticityEnabled", "boolean"],
    elasticity: ["demand.elasticity", "nonnegative"],
    roundingStep: ["pricing.roundingStep", "positive"],
    externalAdjustment: ["pricing.externalAdjustment", "discount"],
    buyerFee: ["pricing.buyerFee", "nonnegative"],
    buyerFeeRetained: ["pricing.buyerFeeRetained", "boolean"],
    platformPercent: ["pricing.platformPercent", "nonnegative"],
    platformFixed: ["pricing.platformFixed", "nonnegative"]
  };

  function getPath(object, path) {
    return path.split(".").reduce((current, part) => current?.[part], object);
  }

  function setPath(object, path, value) {
    const parts = path.split(".");
    const last = parts.pop();
    const target = parts.reduce((current, part) => current[part], object);
    target[last] = value;
  }

  function parseByType(element, type, previous) {
    if (type === "boolean") return element.checked;
    if (type === "string") return element.value;
    if (type === "integer") return integerNonNegative(element.value, previous ?? 0);
    if (type === "positive") return finitePositive(element.value, previous ?? 1);
    if (type === "nonnegative") return finiteNonNegative(element.value, previous ?? 0);
    if (type === "occupancy") return clamp(parseLocaleNumber(element.value, previous ?? 0), 0, 100);
    if (type === "discount") return Math.max(-100, parseLocaleNumber(element.value, previous ?? 0));
    return parseLocaleNumber(element.value, previous ?? 0);
  }

  function setControlValues() {
    Object.entries(controlBindings).forEach(([id, [path, type]]) => {
      const element = $(id);
      if (!element) return;
      const value = getPath(state, path);
      if (type === "boolean") element.checked = Boolean(value);
      else if (element.tagName === "SELECT" || type === "string") element.value = String(value);
      else element.value = formatInput(Number(value));
    });
    $("zoneCount").value = formatInput(state.zones.length, 0);
    $("overallOccupancyRange").value = String(state.demand.overallOccupancy);
    $("betaRange").value = String(Math.min(state.demand.beta, parseLocaleNumber($("betaRange").max, 4)));
  }

  function allActiveOccupanciesEqual() {
    const ids = activeZoneIndices();
    if (ids.length < 2) return true;
    const first = zoneOccupancy(state.zones[ids[0]]);
    return ids.every(i => Math.abs(zoneOccupancy(state.zones[i]) - first) < 1e-9);
  }

  function updateControlVisibility() {
    const model = state.pricing.model;
    const blockMap = {
      average: "averageModelBlock",
      gross: "grossModelBlock",
      minmax: "minmaxModelBlock",
      minimum: "minimumModelBlock",
      maximum: "maximumModelBlock",
      manual: "manualModelBlock"
    };
    Object.entries(blockMap).forEach(([key, id]) => $(id).classList.toggle("hidden", key !== model));
    $("powerExponentWrap").classList.toggle("hidden", state.pricing.curveMode !== "power");
    $("premiumRatioWrap").classList.toggle("hidden", ["minmax", "manual"].includes(model) || state.pricing.curveMode === "manualCoefficient");
    $("elasticityBlock").classList.toggle("hidden", !state.demand.elasticityEnabled);
    $("overallOccupancyWrap").classList.toggle("hidden", state.demand.occupancyMode !== "overall");

    const ids = activeZoneIndices();
    const levelData = priceLevelData(ids);
    const specialModel = ["minmax", "minimum", "maximum"].includes(model);
    $("singleZoneBlock").classList.toggle("hidden", !(ids.length === 1 && specialModel));
    $("flatLevelBlock").classList.toggle("hidden", !(ids.length > 1 && levelData.sameLevel && specialModel));

    const ineffective = model === "gross" && allActiveOccupanciesEqual();
    $("dynamicIneffectiveNote").classList.toggle("hidden", !ineffective);
    $("dynamicPricingGroup").classList.toggle("ineffective", ineffective);
    $("referenceOccupancy").disabled = ineffective;
    $("beta").disabled = ineffective;
    $("betaRange").disabled = ineffective;

    $("oversellPercent").disabled = !state.hall.oversellingEnabled;
    $("oversellPercentWrap").classList.toggle("disabled-block", !state.hall.oversellingEnabled);

    const manual = model === "manual";
    $("copyToManualBtn").disabled = manual;
    $("pricingTableHint").textContent = manual
      ? state.pricing.manualPriceMode === "base"
        ? "Вводятся базовые цены; динамика, корректировка, округление и сбор применяются после них."
        : "Вводятся окончательные цены покупателя; динамика и внешняя корректировка к ним не применяются."
      : model === "gross"
        ? "Цена подбирается под целевую сумму до внешней корректировки."
        : "Цена рассчитывается по выбранной структуре и активным зонам.";
  }

  function updateCapacitySummary() {
    const hall = integerNonNegative(state.hall.capacity, 0);
    const distributed = hallDistributedCapacity();
    const difference = hall - distributed;
    const sellable = Math.round(distributed * oversellMultiplier());
    $("hallCapacityStatus").textContent = formatNumber(hall);
    $("zoneCapacityStatus").textContent = formatNumber(distributed);
    $("sellableCapacityStatus").textContent = formatNumber(sellable, Number.isInteger(sellable) ? 0 : 2);
    const diffElement = $("capacityDifferenceStatus");
    diffElement.textContent = difference === 0 ? "0" : difference > 0 ? `+${formatNumber(difference)}` : `−${formatNumber(Math.abs(difference))}`;
    diffElement.className = difference === 0 ? "ok" : difference > 0 ? "warn" : "bad";

    const messages = [];
    if (difference > 0) messages.push(`${formatNumber(difference)} мест не распределено по зонам.`);
    if (difference < 0) messages.push(`По зонам распределено на ${formatNumber(Math.abs(difference))} мест больше заявленной вместимости.`);
    if (state.hall.capacityMode === "strict" && difference !== 0) messages.push("Строгий режим блокирует финансовый расчёт до устранения разницы.");
    const warning = $("capacityWarning");
    warning.textContent = messages.join(" ");
    warning.classList.toggle("hidden", messages.length === 0);
  }

  function virtualRange(viewport, total, rowHeight) {
    if (total <= VIRTUAL_THRESHOLD) return { start: 0, end: total, top: 0, bottom: 0 };
    const visible = Math.max(1, Math.ceil(viewport.clientHeight / rowHeight));
    const rawStart = Math.max(0, Math.floor(viewport.scrollTop / rowHeight) - OVERSCAN);
    const start = Math.min(rawStart, Math.max(0, total - visible));
    const end = Math.min(total, start + visible + OVERSCAN * 2);
    return {
      start,
      end,
      top: start * rowHeight,
      bottom: Math.max(0, (total - end) * rowHeight)
    };
  }

  function spacerRow(height, colspan) {
    return height > 0 ? `<tr class="virtual-spacer" aria-hidden="true"><td colspan="${colspan}" style="height:${height}px"></td></tr>` : "";
  }

  function configRowHtml(zone, index) {
    return `<tr data-zone-id="${zone.id}" data-zone-index="${index}">
      <td>${index + 1}</td>
      <td><input class="table-input label-input" data-field="label" type="text" value="${escapeHtml(zone.label)}" aria-label="Название зоны ${index + 1}"></td>
      <td><input class="table-input number-input" data-field="seats" type="text" inputmode="numeric" value="${formatInput(zone.seats, 0)}" aria-label="Количество мест в зоне ${escapeHtml(zone.label)}"></td>
      <td><input class="table-input number-input" data-field="priceIndex" type="text" inputmode="decimal" value="${formatInput(zone.priceIndex)}" aria-label="Ценовой индекс зоны ${escapeHtml(zone.label)}"></td>
      <td><input class="table-input number-input" data-field="coefficient" type="text" inputmode="decimal" value="${formatInput(zone.coefficient)}" aria-label="Ручной ценовой коэффициент зоны ${escapeHtml(zone.label)}"></td>
      <td><div class="row-actions">
        <button class="icon-btn" type="button" data-action="move-up" aria-label="Переместить зону ${escapeHtml(zone.label)} вверх" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-btn" type="button" data-action="move-down" aria-label="Переместить зону ${escapeHtml(zone.label)} вниз" ${index === state.zones.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icon-btn" type="button" data-action="duplicate" aria-label="Дублировать зону ${escapeHtml(zone.label)}">⧉</button>
        <button class="icon-btn danger" type="button" data-action="delete" aria-label="Удалить зону ${escapeHtml(zone.label)}">×</button>
      </div></td>
    </tr>`;
  }

  function renderConfigWindow(force = false) {
    const viewport = $("configViewport");
    const range = virtualRange(viewport, state.zones.length, CONFIG_ROW_HEIGHT);
    if (!force && range.start === configWindow.start && range.end === configWindow.end) return;
    configWindow = range;
    const rows = [];
    rows.push(spacerRow(range.top, 6));
    for (let i = range.start; i < range.end; i += 1) rows.push(configRowHtml(state.zones[i], i));
    rows.push(spacerRow(range.bottom, 6));
    $("configBody").innerHTML = rows.join("");
  }

  function resultForZone(zone) {
    return lastResult?.byId?.get(zone.id) || null;
  }

  function pricingRowHtml(zone, index) {
    const row = resultForZone(zone);
    const active = zone.active;
    const occupancy = zoneOccupancy(zone);
    const manual = state.pricing.model === "manual";
    const manualCustomer = manual && state.pricing.manualPriceMode === "customer";
    const priceValue = manualCustomer ? zone.manualCustomer : zone.manualBase;
    const computedBase = row?.basePrice ?? 0;
    const shownInput = manual ? priceValue : computedBase;
    const sold = row?.sold ?? 0;
    const sellable = active ? zoneSellableSeats(zone) : 0;
    const percent = sellable > 0 ? Math.min(100, sold / sellable * 100) : 0;
    return `<tr data-zone-id="${zone.id}" data-zone-index="${index}" class="${active ? "" : "inactive"}">
      <td><label class="toggle"><input data-field="active" type="checkbox" ${active ? "checked" : ""} aria-label="${active ? "Отключить" : "Включить"} зону ${escapeHtml(zone.label)}"><span class="toggle-slider"></span></label></td>
      <td class="zone-name" data-cell="label">${escapeHtml(zone.label)}</td>
      <td data-cell="seats">${formatNumber(zone.seats)}</td>
      <td data-cell="sellable">${formatNumber(sellable, Number.isInteger(sellable) ? 0 : 2)}</td>
      <td><div class="occupancy-cell">
        <input data-field="occupancy-range" type="range" min="0" max="100" step="1" value="${occupancy}" ${state.demand.occupancyMode === "overall" || !active ? "disabled" : ""} aria-label="Заполняемость зоны ${escapeHtml(zone.label)}">
        <input data-field="occupancy" type="text" inputmode="decimal" value="${formatInput(occupancy)}" ${state.demand.occupancyMode === "overall" || !active ? "disabled" : ""} aria-label="Заполняемость зоны ${escapeHtml(zone.label)} в процентах">
      </div></td>
      <td><div class="sales-cell"><div class="sales-bar"><span data-cell="sales-bar" style="width:${percent}%"></span></div><span data-cell="sold">${formatNumber(sold)}</span></div></td>
      <td><input class="table-input price-input" data-field="manual-price" type="text" inputmode="decimal" value="${formatInput(shownInput, 2)}" ${manual && active ? "" : "disabled"} aria-label="${manualCustomer ? "Окончательная" : "Базовая"} цена зоны ${escapeHtml(zone.label)}"></td>
      <td data-cell="demand-factor">${row ? formatNumber(row.demandFactor, 3) : "—"}</td>
      <td data-cell="ticket-price">${row ? formatEuro(row.ticketPrice, 2) : "—"}</td>
      <td data-cell="buyer-fee">${row ? formatEuro(row.buyerFee, 2) : "—"}</td>
      <td data-cell="customer-price" class="zone-name">${row ? formatEuro(row.customerPrice, 2) : "—"}</td>
      <td data-cell="zone-revenue">${row ? formatEuro(row.zoneRevenue, 2) : "—"}</td>
    </tr>`;
  }

  function renderPricingWindow(force = false) {
    const viewport = $("pricingViewport");
    const range = virtualRange(viewport, state.zones.length, PRICING_ROW_HEIGHT);
    if (!force && range.start === pricingWindow.start && range.end === pricingWindow.end) return;
    pricingWindow = range;
    const rows = [];
    rows.push(spacerRow(range.top, 12));
    for (let i = range.start; i < range.end; i += 1) rows.push(pricingRowHtml(state.zones[i], i));
    rows.push(spacerRow(range.bottom, 12));
    $("pricingBody").innerHTML = rows.join("");
  }

  function setTextPreserveTitle(element, compact, full) {
    element.textContent = compact;
    element.title = full;
  }

  function updateMetricCard(mainId, fullId, value, options = {}) {
    const currency = options.currency === true;
    const main = $(mainId);
    const full = $(fullId);
    const compact = currency ? compactNumber(value, true) : compactNumber(value, false);
    const fullText = currency
      ? formatEuro(value, options.digits ?? 2)
      : formatNumber(value, options.digits ?? 0);
    setTextPreserveTitle(main, compact, fullText);
    full.textContent = fullText;
    full.title = fullText;
  }

  function updateMetrics() {
    const metrics = lastResult?.metrics || computeMetrics([]);
    updateMetricCard("metricSold", "metricSoldFull", metrics.sold, { digits: 0 });
    updateMetricCard("metricTicketRevenue", "metricTicketRevenueFull", metrics.ticketRevenue, { currency: true, digits: 2 });
    updateMetricCard("metricBuyerFees", "metricBuyerFeesFull", metrics.buyerFees, { currency: true, digits: 2 });
    updateMetricCard("metricTotalPaid", "metricTotalPaidFull", metrics.totalPaid, { currency: true, digits: 2 });
    updateMetricCard("metricPlatformCommission", "metricPlatformCommissionFull", metrics.platformCommission, { currency: true, digits: 2 });
    updateMetricCard("metricOrganizer", "metricOrganizerFull", metrics.organizer, { currency: true, digits: 2 });
    updateMetricCard("metricAveragePrice", "metricAveragePriceFull", metrics.averageCustomerPrice, { currency: true, digits: 2 });
    updateMetricCard("metricActiveCapacity", "metricActiveCapacityFull", metrics.activeSellableCapacity, { digits: Number.isInteger(metrics.activeSellableCapacity) ? 0 : 2 });

    const targetCard = $("targetResultCard");
    const target = lastResult?.target;
    targetCard.classList.toggle("hidden", !target);
    if (target) {
      const isAverage = target.metric === "averageCustomerPrice";
      const formatter = isAverage ? value => formatEuro(value, 2) : value => formatEuro(value, 2);
      $("targetRequested").textContent = formatter(target.requested);
      $("targetAchieved").textContent = formatter(target.achieved);
      $("targetMinimum").textContent = formatter(target.minimum);
      const delta = target.final - target.requested;
      $("targetFinalDelta").textContent = `${delta >= 0 ? "+" : ""}${formatter(delta)}`;
      $("targetFinalDelta").className = Math.abs(delta) < 0.01 ? "ok" : delta > 0 ? "warn" : "bad";
    }
  }

  function refreshVisiblePricingRows() {
    const rows = $("pricingBody").querySelectorAll("tr[data-zone-id]");
    rows.forEach(tr => {
      const zoneIndex = zoneIndexById.get(tr.dataset.zoneId);
      const zone = zoneIndex === undefined ? null : state.zones[zoneIndex];
      if (!zone) return;
      const result = resultForZone(zone);
      const active = zone.active;
      tr.classList.toggle("inactive", !active);
      const activeInput = tr.querySelector('[data-field="active"]');
      if (activeInput) {
        activeInput.checked = active;
        activeInput.setAttribute("aria-label", `${active ? "Отключить" : "Включить"} зону ${zone.label}`);
      }
      const labelCell = tr.querySelector('[data-cell="label"]');
      if (labelCell) labelCell.textContent = zone.label;
      const seatsCell = tr.querySelector('[data-cell="seats"]');
      if (seatsCell) seatsCell.textContent = formatNumber(zone.seats);
      const sellable = active ? zoneSellableSeats(zone) : 0;
      const sellableCell = tr.querySelector('[data-cell="sellable"]');
      if (sellableCell) sellableCell.textContent = formatNumber(sellable, Number.isInteger(sellable) ? 0 : 2);
      const occupancy = zoneOccupancy(zone);
      const occRange = tr.querySelector('[data-field="occupancy-range"]');
      const occInput = tr.querySelector('[data-field="occupancy"]');
      const occupancyDisabled = state.demand.occupancyMode === "overall" || !active;
      if (occRange) {
        occRange.disabled = occupancyDisabled;
        if (document.activeElement !== occRange) occRange.value = String(occupancy);
      }
      if (occInput) {
        occInput.disabled = occupancyDisabled;
        if (document.activeElement !== occInput) occInput.value = formatInput(occupancy);
      }
      const sold = result?.sold ?? 0;
      const soldCell = tr.querySelector('[data-cell="sold"]');
      if (soldCell) soldCell.textContent = formatNumber(sold);
      const salesBar = tr.querySelector('[data-cell="sales-bar"]');
      if (salesBar) salesBar.style.width = `${sellable > 0 ? Math.min(100, sold / sellable * 100) : 0}%`;
      const manualInput = tr.querySelector('[data-field="manual-price"]');
      if (manualInput) {
        const manual = state.pricing.model === "manual";
        manualInput.disabled = !(manual && active);
        if (document.activeElement !== manualInput) {
          const value = manual
            ? state.pricing.manualPriceMode === "customer" ? zone.manualCustomer : zone.manualBase
            : result?.basePrice ?? 0;
          manualInput.value = formatInput(value, 2);
        }
        manualInput.setAttribute("aria-label", `${state.pricing.manualPriceMode === "customer" ? "Окончательная" : "Базовая"} цена зоны ${zone.label}`);
      }
      const mappings = {
        "demand-factor": result ? formatNumber(result.demandFactor, 3) : "—",
        "ticket-price": result ? formatEuro(result.ticketPrice, 2) : "—",
        "buyer-fee": result ? formatEuro(result.buyerFee, 2) : "—",
        "customer-price": result ? formatEuro(result.customerPrice, 2) : "—",
        "zone-revenue": result ? formatEuro(result.zoneRevenue, 2) : "—"
      };
      Object.entries(mappings).forEach(([cell, value]) => {
        const element = tr.querySelector(`[data-cell="${cell}"]`);
        if (element) {
          element.textContent = value;
          element.title = value;
        }
      });
    });
  }

  function updateWarnings() {
    const messages = [];
    if (lastResult?.errors?.length) messages.push(...lastResult.errors);
    if (lastResult?.warnings?.length) messages.push(...lastResult.warnings);
    if (state.pricing.roundingStep <= 0) messages.push("Шаг округления должен быть больше нуля.");
    if (state.pricing.curveMode === "geometric" && state.pricing.model === "minmax" && state.pricing.minimumPrice <= 0) {
      messages.push("Геометрическая интерполяция требует положительного MIN; временно используется линейная граница.");
    }
    const element = $("calculationWarning");
    element.textContent = [...new Set(messages)].join(" ");
    element.classList.toggle("hidden", messages.length === 0);
  }

  function recalculateNow() {
    updateControlVisibility();
    updateCapacitySummary();
    lastResult = calculateScenario();
    updateMetrics();
    refreshVisiblePricingRows();
    updateWarnings();
    scheduleAutosave();
  }

  function scheduleRecalculation(immediate = false) {
    clearTimeout(recalcTimer);
    if (immediate) {
      recalculateNow();
      return;
    }
    recalcTimer = setTimeout(recalculateNow, RECALC_DELAY);
  }

  function fullRender() {
    setControlValues();
    updateControlVisibility();
    updateCapacitySummary();
    lastResult = calculateScenario();
    renderConfigWindow(true);
    renderPricingWindow(true);
    updateMetrics();
    updateWarnings();
    refreshProjectLists();
    scheduleAutosave();
  }

  let zoneIndexById = new Map();
  function rebuildZoneIndex() {
    zoneIndexById = new Map(state.zones.map((zone, index) => [zone.id, index]));
  }

  function redistributePriceIndexes() {
    const count = state.zones.length;
    state.zones.forEach((zone, index) => {
      zone.priceIndex = count <= 1 ? 50 : 100 - 100 * index / (count - 1);
    });
  }

  function structureChanged() {
    rebuildZoneIndex();
    $("zoneCount").value = formatInput(state.zones.length, 0);
    renderConfigWindow(true);
    renderPricingWindow(true);
    scheduleRecalculation(true);
  }

  function addZone(afterIndex = state.zones.length - 1, source = null) {
    const insertIndex = clamp(afterIndex + 1, 0, state.zones.length);
    const zone = source ? {
      ...source,
      id: uid(),
      label: `${source.label} — копия`
    } : createZone(insertIndex, state.zones.length + 1, 0);
    state.zones.splice(insertIndex, 0, zone);
    redistributePriceIndexes();
    structureChanged();
  }

  function deleteZone(index) {
    if (state.zones.length <= 1) {
      showToast("В проекте должна оставаться хотя бы одна зона.");
      return;
    }
    const zone = state.zones[index];
    askConfirmation(`Удалить зону «${zone.label}»? Удаление можно отменить до следующей перезагрузки страницы.`, () => {
      const [removed] = state.zones.splice(index, 1);
      deletedZoneStack.push({ zone: removed, index });
      $("undoDeleteBtn").disabled = false;
      redistributePriceIndexes();
      structureChanged();
    });
  }

  function undoDelete() {
    const item = deletedZoneStack.pop();
    if (!item) return;
    state.zones.splice(Math.min(item.index, state.zones.length), 0, item.zone);
    $("undoDeleteBtn").disabled = deletedZoneStack.length === 0;
    redistributePriceIndexes();
    structureChanged();
  }

  function moveZone(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= state.zones.length) return;
    const [zone] = state.zones.splice(index, 1);
    state.zones.splice(target, 0, zone);
    rebuildZoneIndex();
    renderConfigWindow(true);
    renderPricingWindow(true);
    scheduleRecalculation(true);
  }

  function applyZoneCount() {
    const requested = Math.max(1, integerNonNegative($("zoneCount").value, state.zones.length));
    if (requested === state.zones.length) return;
    const apply = () => {
      if (requested > state.zones.length) {
        const add = requested - state.zones.length;
        for (let i = 0; i < add; i += 1) state.zones.push(createZone(state.zones.length, requested, 0));
      } else {
        const removed = state.zones.splice(requested);
        removed.forEach((zone, offset) => deletedZoneStack.push({ zone, index: requested + offset }));
        $("undoDeleteBtn").disabled = deletedZoneStack.length === 0;
      }
      redistributePriceIndexes();
      structureChanged();
    };
    if (requested < state.zones.length) {
      askConfirmation(`Количество зон уменьшится с ${state.zones.length} до ${requested}. Удалённые зоны можно будет вернуть кнопкой «Отменить удаление».`, apply);
    } else {
      apply();
    }
  }

  function equalizeSeats() {
    const seats = distributeSeats(integerNonNegative(state.hall.capacity, 0), state.zones.length);
    state.zones.forEach((zone, index) => { zone.seats = seats[index]; });
    renderConfigWindow(true);
    scheduleRecalculation(true);
  }

  function loadAuditoriPreset() {
    askConfirmation("Заменить текущую конфигурацию рабочим примером L’Auditori? Пресет не является официальным техническим паспортом.", () => {
      const source = [
        ["Zona 1", 424, 100], ["Zona 1A", 184, 100], ["Zona 2", 266, 75.07], ["Zona 2A", 90, 75.07],
        ["Zona 3", 112, 45.26], ["Zona 3A", 112, 45.26], ["Zona 4", 249, 30.18], ["Zona 4A", 204, 30.18],
        ["Zona 4B", 204, 30.18], ["Zona 5", 138, 15.96], ["Zona 6", 198, 0]
      ];
      state.hall.name = "Sala 1 Pau Casals — L’Auditori (рабочий пример)";
      state.hall.capacity = 2199;
      state.hall.capacityMode = "free";
      state.zones = source.map(([label, seats, priceIndex]) => ({
        id: uid(), label, seats, priceIndex, coefficient: 1, active: true,
        occupancy: 75, manualBase: 0, manualCustomer: 0
      }));
      setControlValues();
      structureChanged();
    });
  }

  function copyCurrentPricesToManual() {
    if (!lastResult) lastResult = calculateScenario();
    state.zones.forEach(zone => {
      const row = lastResult.byId.get(zone.id);
      if (!row) return;
      zone.manualBase = row.basePrice;
      zone.manualCustomer = row.customerPrice;
    });
    state.pricing.model = "manual";
    state.pricing.manualPriceMode = "base";
    setControlValues();
    updateControlVisibility();
    renderPricingWindow(true);
    scheduleRecalculation(true);
  }

  function clearManualPrices() {
    state.zones.forEach(zone => {
      zone.manualBase = 0;
      zone.manualCustomer = 0;
    });
    refreshVisiblePricingRows();
    scheduleRecalculation(true);
  }

  function resetPricing() {
    const defaults = defaultState().pricing;
    state.pricing = { ...defaults };
    setControlValues();
    updateControlVisibility();
    renderPricingWindow(true);
    scheduleRecalculation(true);
  }

  function resetOccupancy() {
    const defaults = defaultState().demand;
    state.demand = { ...defaults };
    state.zones.forEach(zone => { zone.occupancy = defaults.overallOccupancy; });
    setControlValues();
    document.querySelectorAll("[data-occupancy-mode]").forEach(button => button.classList.toggle("active", button.dataset.occupancyMode === state.demand.occupancyMode));
    renderPricingWindow(true);
    scheduleRecalculation(true);
  }

  function resetScenario() {
    askConfirmation("Сбросить весь сценарий, включая зал, зоны, цены, заполняемость и комиссии?", () => {
      state = defaultState();
      deletedZoneStack = [];
      $("undoDeleteBtn").disabled = true;
      rebuildZoneIndex();
      fullRender();
    });
  }

  function refreshProjectLists() {
    const projects = storageRead(STORAGE_KEYS.projects, {});
    const halls = storageRead(STORAGE_KEYS.halls, {});
    const projectSelect = $("savedProjects");
    const hallSelect = $("savedHalls");
    const currentProject = projectSelect.value;
    const currentHall = hallSelect.value;
    projectSelect.innerHTML = '<option value="">— нет сохранённых проектов —</option>' + Object.keys(projects)
      .sort((a, b) => a.localeCompare(b, "ru"))
      .map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
    hallSelect.innerHTML = '<option value="">— нет сохранённых залов —</option>' + Object.keys(halls)
      .sort((a, b) => a.localeCompare(b, "ru"))
      .map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
    if (projects[currentProject]) projectSelect.value = currentProject;
    if (halls[currentHall]) hallSelect.value = currentHall;
  }

  function saveNamedProject() {
    const name = state.projectName.trim() || "Проект без названия";
    state.projectName = name;
    $("projectName").value = name;
    const projects = storageRead(STORAGE_KEYS.projects, {});
    projects[name] = { savedAt: new Date().toISOString(), state };
    if (storageWrite(STORAGE_KEYS.projects, projects)) {
      refreshProjectLists();
      $("savedProjects").value = name;
      showToast(`Проект «${name}» сохранён.`);
    }
  }

  function loadNamedProject() {
    const name = $("savedProjects").value;
    if (!name) return showToast("Выберите сохранённый проект.");
    const projects = storageRead(STORAGE_KEYS.projects, {});
    const record = projects[name];
    if (!record?.state) return showToast("Проект не найден.");
    askConfirmation(`Загрузить проект «${name}» и заменить текущий сценарий?`, () => {
      state = normalizeState(record.state);
      deletedZoneStack = [];
      rebuildZoneIndex();
      fullRender();
      showToast(`Проект «${name}» загружен.`);
    });
  }

  function deleteNamedProject() {
    const name = $("savedProjects").value;
    if (!name) return showToast("Выберите сохранённый проект.");
    askConfirmation(`Удалить сохранённый проект «${name}»?`, () => {
      const projects = storageRead(STORAGE_KEYS.projects, {});
      delete projects[name];
      storageWrite(STORAGE_KEYS.projects, projects);
      refreshProjectLists();
      showToast(`Проект «${name}» удалён.`);
    });
  }

  function saveHallTemplate() {
    const name = state.hall.name.trim() || "Зал без названия";
    const halls = storageRead(STORAGE_KEYS.halls, {});
    halls[name] = {
      savedAt: new Date().toISOString(),
      hall: state.hall,
      zones: state.zones
    };
    if (storageWrite(STORAGE_KEYS.halls, halls)) {
      refreshProjectLists();
      $("savedHalls").value = name;
      showToast(`Конфигурация зала «${name}» сохранена.`);
    }
  }

  function loadHallTemplate() {
    const name = $("savedHalls").value;
    if (!name) return showToast("Выберите сохранённый зал.");
    const halls = storageRead(STORAGE_KEYS.halls, {});
    const record = halls[name];
    if (!record?.zones) return showToast("Шаблон зала не найден.");
    askConfirmation(`Загрузить зал «${name}»? Параметры цен и комиссий сохранятся.`, () => {
      state.hall = { ...state.hall, ...record.hall };
      state.zones = record.zones.map((zone, i) => normalizeZone(zone, i, record.zones.length));
      rebuildZoneIndex();
      fullRender();
      showToast(`Зал «${name}» загружен.`);
    });
  }

  function deleteHallTemplate() {
    const name = $("savedHalls").value;
    if (!name) return showToast("Выберите сохранённый зал.");
    askConfirmation(`Удалить сохранённый зал «${name}»?`, () => {
      const halls = storageRead(STORAGE_KEYS.halls, {});
      delete halls[name];
      storageWrite(STORAGE_KEYS.halls, halls);
      refreshProjectLists();
      showToast(`Зал «${name}» удалён.`);
    });
  }

  function exportProjectJson() {
    const payload = {
      application: "Универсальный калькулятор цен для залов",
      version: APP_VERSION,
      type: "full-project",
      exportedAt: new Date().toISOString(),
      state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `${safeFilename(state.projectName || state.hall.name)}_${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function importProjectJson(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.type === "full-project" && parsed.state) {
        state = normalizeState(parsed.state);
      } else if (parsed?.hall && Array.isArray(parsed?.zones)) {
        state.hall = { ...state.hall, ...parsed.hall };
        state.zones = parsed.zones.map((zone, i) => normalizeZone(zone, i, parsed.zones.length));
      } else if (parsed?.zones && parsed?.pricing) {
        state = normalizeState(parsed);
      } else {
        throw new Error("Файл не содержит поддерживаемый проект или конфигурацию зала.");
      }
      deletedZoneStack = [];
      rebuildZoneIndex();
      fullRender();
      showToast("JSON-файл импортирован.");
    } catch (error) {
      setStorageMessage(`Ошибка импорта JSON: ${error.message}`, "error");
    } finally {
      $("importJsonInput").value = "";
    }
  }

  function csvSafe(value) {
    let text = String(value ?? "");
    const safeNegativeNumber = /^-\d+(?:[.,]\d+)?$/.test(text);
    if (/^[=+@]/.test(text) || text.startsWith("-") && !safeNegativeNumber) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function csvNumber(value, digits = 2) {
    if (!Number.isFinite(value)) return "";
    return value.toFixed(digits).replace(".", ",");
  }

  function modelLabel() {
    return {
      average: "По целевой средней цене",
      gross: "По целевой сумме",
      minmax: "По минимуму и максимуму",
      minimum: "Только по минимальной цене",
      maximum: "Только по максимальной цене",
      manual: "Ручные цены"
    }[state.pricing.model] || state.pricing.model;
  }

  function exportCsv() {
    if (!lastResult) lastResult = calculateScenario();
    const now = new Date();
    const metrics = lastResult.metrics;
    const rows = [];
    rows.push(["ПАРАМЕТРЫ ПРОЕКТА"]);
    rows.push(["Дата экспорта", now.toLocaleString("ru-RU")]);
    rows.push(["Версия модели", APP_VERSION]);
    rows.push(["Название проекта", state.projectName]);
    rows.push(["Название зала", state.hall.name]);
    rows.push(["Вместимость зала", state.hall.capacity]);
    rows.push(["Сумма мест по зонам", hallDistributedCapacity()]);
    rows.push(["Режим вместимости", state.hall.capacityMode === "strict" ? "Строгий" : "Свободный"]);
    rows.push(["Overselling включён", state.hall.oversellingEnabled ? "Да" : "Нет"]);
    rows.push(["Дополнительный лимит продаж, %", csvNumber(state.hall.oversellPercent, 4)]);
    rows.push(["Ценовая модель", modelLabel()]);
    rows.push(["Ценовая кривая", state.pricing.curveMode]);
    rows.push(["Режим ценового индекса", state.pricing.indexMode]);
    rows.push(["Ожидаемая заполняемость общая, %", csvNumber(state.demand.overallOccupancy, 4)]);
    rows.push(["Опорная заполняемость, %", csvNumber(state.demand.referenceOccupancy, 4)]);
    rows.push(["β", csvNumber(state.demand.beta, 6)]);
    rows.push(["Эластичность включена", state.demand.elasticityEnabled ? "Да" : "Нет"]);
    rows.push(["Эластичность ε", csvNumber(state.demand.elasticity, 6)]);
    rows.push(["Шаг округления, €", csvNumber(state.pricing.roundingStep, 4)]);
    rows.push(["Внешняя наценка/скидка, %", csvNumber(state.pricing.externalAdjustment, 4)]);
    rows.push(["Сервисный сбор, €", csvNumber(state.pricing.buyerFee, 4)]);
    rows.push(["Сбор остаётся организатору", state.pricing.buyerFeeRetained ? "Да" : "Нет"]);
    rows.push(["Комиссия платформы, %", csvNumber(state.pricing.platformPercent, 4)]);
    rows.push(["Фиксированная комиссия платформы, €", csvNumber(state.pricing.platformFixed, 4)]);
    rows.push([]);
    rows.push(["ИТОГИ"]);
    rows.push(["Ожидаемые продажи", metrics.sold]);
    rows.push(["Номинальная билетная выручка, €", csvNumber(metrics.ticketRevenue, 2)]);
    rows.push(["Сервисные сборы покупателей, €", csvNumber(metrics.buyerFees, 2)]);
    rows.push(["Всего заплатят покупатели, €", csvNumber(metrics.totalPaid, 2)]);
    rows.push(["Комиссия платформы, €", csvNumber(metrics.platformCommission, 2)]);
    rows.push(["Организатору до налогов, €", csvNumber(metrics.organizer, 2)]);
    rows.push(["Средняя цена покупателя, €", csvNumber(metrics.averageCustomerPrice, 2)]);
    if (lastResult.target) {
      rows.push(["Целевая сумма, €", csvNumber(lastResult.target.requested, 2)]);
      rows.push(["Достигнуто до внешней корректировки, €", csvNumber(lastResult.target.achieved, 2)]);
      rows.push(["Минимально достижимая сумма, €", csvNumber(lastResult.target.minimum, 2)]);
      rows.push(["Фактическая сумма после корректировки, €", csvNumber(lastResult.target.final, 2)]);
    }
    rows.push([]);
    rows.push(["ЗОНЫ"]);
    rows.push([
      "№", "Активна", "Название зоны", "Номинальных мест", "Продаваемых мест", "Ценовой индекс",
      "Ручной коэффициент", "Заполняемость, %", "Продано", "Базовая цена, €", "Коэффициент спроса",
      "Цена билета, €", "Сервисный сбор, €", "Цена покупателя, €", "Выручка зоны, €"
    ]);
    state.zones.forEach((zone, index) => {
      const result = lastResult.byId.get(zone.id);
      rows.push([
        index + 1,
        zone.active ? "Да" : "Нет",
        zone.label,
        zone.seats,
        csvNumber(zone.active ? zoneSellableSeats(zone) : 0, 4),
        csvNumber(zone.priceIndex, 6),
        csvNumber(zone.coefficient, 6),
        csvNumber(zoneOccupancy(zone), 4),
        result?.sold ?? 0,
        csvNumber(result?.basePrice ?? 0, 2),
        csvNumber(result?.demandFactor ?? 0, 6),
        csvNumber(result?.ticketPrice ?? 0, 2),
        csvNumber(result?.buyerFee ?? 0, 2),
        csvNumber(result?.customerPrice ?? 0, 2),
        csvNumber(result?.zoneRevenue ?? 0, 2)
      ]);
    });
    const csv = "\uFEFF" + rows.map(row => row.map(csvSafe).join(";")).join("\r\n");
    const filename = `${safeFilename(state.hall.name)}_${now.toISOString().slice(0, 10)}_расчёт.csv`;
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
  }

  function normalizeControlOnBlur(element) {
    const binding = controlBindings[element.id];
    if (!binding) return;
    const [path, type] = binding;
    const value = getPath(state, path);
    if (type === "boolean" || type === "string") return;
    element.value = formatInput(Number(value));
  }

  function handleBoundControl(event) {
    const element = event.target;
    const binding = controlBindings[element.id];
    if (!binding) return;
    const [path, type] = binding;
    const previous = getPath(state, path);
    const oldModel = state.pricing.model;
    const value = parseByType(element, type, previous);

    if (element.id === "pricingModel" && value === "manual" && oldModel !== "manual") {
      if (!lastResult) lastResult = calculateScenario();
      state.zones.forEach(zone => {
        const row = lastResult.byId.get(zone.id);
        if (!row) return;
        zone.manualBase = row.basePrice;
        zone.manualCustomer = row.customerPrice;
      });
    }

    setPath(state, path, value);

    if (element.id === "overallOccupancy") $("overallOccupancyRange").value = String(value);
    if (element.id === "beta") $("betaRange").value = String(Math.min(value, parseLocaleNumber($("betaRange").max, 4)));
    if (element.id === "projectName") state.projectName = element.value;
    if (element.id === "hallName") state.hall.name = element.value;

    const requiresPricingRerender = [
      "pricingModel", "manualPriceMode", "curveMode", "indexMode", "capacityMode",
      "oversellingEnabled", "buyerFeeRetained"
    ].includes(element.id);
    if (requiresPricingRerender) renderPricingWindow(true);
    updateControlVisibility();
    updateCapacitySummary();
    scheduleRecalculation(event.type === "change");
  }

  $("configBody").addEventListener("input", event => {
    const input = event.target.closest("[data-field]");
    const tr = event.target.closest("tr[data-zone-id]");
    if (!input || !tr) return;
    const index = zoneIndexById.get(tr.dataset.zoneId);
    if (index === undefined) return;
    const zone = state.zones[index];
    const field = input.dataset.field;
    if (field === "label") zone.label = input.value;
    else if (field === "seats") zone.seats = integerNonNegative(input.value, zone.seats);
    else if (field === "priceIndex") zone.priceIndex = parseLocaleNumber(input.value, zone.priceIndex);
    else if (field === "coefficient") zone.coefficient = parseLocaleNumber(input.value, zone.coefficient);
    updateCapacitySummary();
    refreshVisiblePricingRows();
    updateControlVisibility();
    scheduleRecalculation(false);
  });

  $("configBody").addEventListener("focusout", event => {
    const input = event.target.closest("[data-field]");
    const tr = event.target.closest("tr[data-zone-id]");
    if (!input || !tr) return;
    const index = zoneIndexById.get(tr.dataset.zoneId);
    if (index === undefined) return;
    const zone = state.zones[index];
    if (input.dataset.field === "seats") input.value = formatInput(zone.seats, 0);
    if (input.dataset.field === "priceIndex") input.value = formatInput(zone.priceIndex);
    if (input.dataset.field === "coefficient") input.value = formatInput(zone.coefficient);
  });

  $("configBody").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    const tr = event.target.closest("tr[data-zone-id]");
    if (!button || !tr) return;
    const index = zoneIndexById.get(tr.dataset.zoneId);
    if (index === undefined) return;
    if (button.dataset.action === "move-up") moveZone(index, -1);
    else if (button.dataset.action === "move-down") moveZone(index, 1);
    else if (button.dataset.action === "duplicate") addZone(index, state.zones[index]);
    else if (button.dataset.action === "delete") deleteZone(index);
  });

  $("pricingBody").addEventListener("input", event => {
    const input = event.target.closest("[data-field]");
    const tr = event.target.closest("tr[data-zone-id]");
    if (!input || !tr) return;
    const index = zoneIndexById.get(tr.dataset.zoneId);
    if (index === undefined) return;
    const zone = state.zones[index];
    const field = input.dataset.field;
    if (field === "occupancy-range") {
      zone.occupancy = clamp(parseLocaleNumber(input.value, zone.occupancy), 0, 100);
      const numberInput = tr.querySelector('[data-field="occupancy"]');
      if (numberInput) numberInput.value = formatInput(zone.occupancy);
    } else if (field === "occupancy") {
      zone.occupancy = clamp(parseLocaleNumber(input.value, zone.occupancy), 0, 100);
      const range = tr.querySelector('[data-field="occupancy-range"]');
      if (range) range.value = String(zone.occupancy);
    } else if (field === "manual-price") {
      const value = finiteNonNegative(input.value, state.pricing.manualPriceMode === "customer" ? zone.manualCustomer : zone.manualBase);
      if (state.pricing.manualPriceMode === "customer") zone.manualCustomer = value;
      else zone.manualBase = value;
    }
    updateControlVisibility();
    scheduleRecalculation(false);
  });

  $("pricingBody").addEventListener("change", event => {
    const input = event.target.closest("[data-field]");
    const tr = event.target.closest("tr[data-zone-id]");
    if (!input || !tr) return;
    const index = zoneIndexById.get(tr.dataset.zoneId);
    if (index === undefined) return;
    if (input.dataset.field === "active") {
      state.zones[index].active = input.checked;
      updateControlVisibility();
      scheduleRecalculation(true);
    }
  });

  $("pricingBody").addEventListener("focusout", event => {
    const input = event.target.closest("[data-field]");
    const tr = event.target.closest("tr[data-zone-id]");
    if (!input || !tr) return;
    const index = zoneIndexById.get(tr.dataset.zoneId);
    if (index === undefined) return;
    const zone = state.zones[index];
    if (input.dataset.field === "occupancy") input.value = formatInput(zone.occupancy);
    if (input.dataset.field === "manual-price") {
      input.value = formatInput(state.pricing.manualPriceMode === "customer" ? zone.manualCustomer : zone.manualBase, 2);
    }
  });

  document.querySelectorAll(Object.keys(controlBindings).map(id => `#${id}`).join(",")).forEach(element => {
    element.addEventListener("input", handleBoundControl);
    element.addEventListener("change", handleBoundControl);
    element.addEventListener("blur", () => normalizeControlOnBlur(element));
  });

  $("overallOccupancyRange").addEventListener("input", event => {
    state.demand.overallOccupancy = clamp(parseLocaleNumber(event.target.value, state.demand.overallOccupancy), 0, 100);
    $("overallOccupancy").value = formatInput(state.demand.overallOccupancy);
    scheduleRecalculation(false);
  });

  $("betaRange").addEventListener("input", event => {
    state.demand.beta = finiteNonNegative(event.target.value, state.demand.beta);
    $("beta").value = formatInput(state.demand.beta);
    scheduleRecalculation(false);
  });

  $("occupancyModeControls").addEventListener("click", event => {
    const button = event.target.closest("[data-occupancy-mode]");
    if (!button) return;
    state.demand.occupancyMode = button.dataset.occupancyMode;
    document.querySelectorAll("[data-occupancy-mode]").forEach(item => item.classList.toggle("active", item === button));
    updateControlVisibility();
    renderPricingWindow(true);
    scheduleRecalculation(true);
  });

  $("configViewport").addEventListener("scroll", throttleFrame(() => renderConfigWindow()));
  $("pricingViewport").addEventListener("scroll", throttleFrame(() => renderPricingWindow()));

  $("addZoneBtn").addEventListener("click", () => addZone());
  $("undoDeleteBtn").addEventListener("click", undoDelete);
  $("applyZoneCountBtn").addEventListener("click", applyZoneCount);
  $("equalSeatsBtn").addEventListener("click", equalizeSeats);
  $("auditoriPresetBtn").addEventListener("click", loadAuditoriPreset);
  $("copyToManualBtn").addEventListener("click", copyCurrentPricesToManual);
  $("clearManualPricesBtn").addEventListener("click", clearManualPrices);
  $("resetPricingBtn").addEventListener("click", resetPricing);
  $("resetOccupancyBtn").addEventListener("click", resetOccupancy);
  $("resetScenarioBtn").addEventListener("click", resetScenario);
  $("enableAllBtn").addEventListener("click", () => {
    state.zones.forEach(zone => { zone.active = true; });
    renderPricingWindow(true);
    scheduleRecalculation(true);
  });
  $("disableAllBtn").addEventListener("click", () => {
    state.zones.forEach(zone => { zone.active = false; });
    renderPricingWindow(true);
    scheduleRecalculation(true);
  });

  $("saveProjectBtn").addEventListener("click", saveNamedProject);
  $("loadProjectBtn").addEventListener("click", loadNamedProject);
  $("deleteProjectBtn").addEventListener("click", deleteNamedProject);
  $("saveHallBtn").addEventListener("click", saveHallTemplate);
  $("loadHallBtn").addEventListener("click", loadHallTemplate);
  $("deleteHallBtn").addEventListener("click", deleteHallTemplate);
  $("exportJsonBtn").addEventListener("click", exportProjectJson);
  $("importJsonBtn").addEventListener("click", () => $("importJsonInput").click());
  $("importJsonInput").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) importProjectJson(file);
  });
  $("exportCsvBtn").addEventListener("click", exportCsv);

  $("openHelpBtn").addEventListener("click", event => openModal("helpModal", event.currentTarget));
  document.addEventListener("click", event => {
    const topicButton = event.target.closest("[data-help-topic]");
    if (!topicButton) return;
    const topic = topicButton.dataset.helpTopic;
    document.querySelectorAll("[data-help-section]").forEach(section => { section.open = section.dataset.helpSection === topic; });
    openModal("helpModal", topicButton);
    const section = document.querySelector(`[data-help-section="${CSS.escape(topic)}"]`);
    if (section) setTimeout(() => section.scrollIntoView({ block: "start" }), 20);
  });
  document.querySelectorAll("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });
  $("helpModal").addEventListener("click", event => {
    if (event.target === $("helpModal")) closeModal("helpModal");
  });
  $("confirmCancelBtn").addEventListener("click", () => {
    pendingConfirm = null;
    closeModal("confirmModal");
  });
  $("confirmOkBtn").addEventListener("click", () => {
    const callback = pendingConfirm;
    pendingConfirm = null;
    closeModal("confirmModal");
    if (typeof callback === "function") callback();
  });
  document.addEventListener("keydown", event => {
    const openModalElement = [$("helpModal"), $("confirmModal")].find(modal => !modal.classList.contains("hidden"));
    if (!openModalElement) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (openModalElement.id === "confirmModal") pendingConfirm = null;
      closeModal(openModalElement.id);
    } else {
      trapFocus(event, openModalElement);
    }
  });

  window.addEventListener("resize", debounce(() => {
    renderConfigWindow(true);
    renderPricingWindow(true);
  }, 120));

  const autosaved = storageRead(STORAGE_KEYS.autosave, null);
  if (autosaved) state = normalizeState(autosaved);
  rebuildZoneIndex();
  setControlValues();
  document.querySelectorAll("[data-occupancy-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.occupancyMode === state.demand.occupancyMode);
  });
  fullRender();
})();
