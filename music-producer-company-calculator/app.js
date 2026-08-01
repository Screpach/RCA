(() => {
  'use strict';

  const STORAGE_KEY = 'producer-os-company-rollup-v1';
  const MODULES = {
    dashboard: { title: 'Company overview', eyebrow: 'Executive planning' },
    ads: { title: 'Audience & Meta advertising', eyebrow: 'Demand forecast', path: 'calculators/meta-ads/index.html' },
    tickets: { title: 'Hall & ticketing', eyebrow: 'Pricing and monetization', path: 'calculators/hall-tickets/index.html' },
    stage: { title: 'Production economics', eyebrow: 'Costs and viability', path: 'calculators/stage-economics/index.html' }
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const percent = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 1 });

  let activeView = 'dashboard';
  let toastTimer = null;

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }

  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    $('#menuBtn').setAttribute('aria-expanded', String(open));
  }

  function ensureFrameLoaded(view) {
    if (view === 'dashboard') return;
    const frame = $(`[data-module-frame="${view}"]`);
    if (!frame || frame.src) return;
    frame.addEventListener('load', () => {
      const loader = $(`[data-loader="${view}"]`);
      if (loader) loader.classList.add('is-done');
    }, { once: true });
    frame.src = frame.dataset.src;
  }

  function navigate(view, updateHash = true) {
    if (!MODULES[view]) view = 'dashboard';
    activeView = view;
    ensureFrameLoaded(view);

    $$('[data-view-panel]').forEach(panel => panel.classList.toggle('is-active', panel.dataset.viewPanel === view));
    $$('.nav-item').forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });

    $('#viewTitle').textContent = MODULES[view].title;
    $('#viewEyebrow').textContent = MODULES[view].eyebrow;
    $$('.toolbar-button').forEach(button => button.classList.toggle('is-hidden', view === 'dashboard'));
    document.body.classList.remove('focus-mode');
    $('#fullscreenBtn').textContent = 'Focus mode';
    setMenu(false);

    if (updateHash) history.replaceState(null, '', view === 'dashboard' ? '#dashboard' : `#${view}`);
  }

  function currentFrame() {
    return activeView === 'dashboard' ? null : $(`[data-module-frame="${activeView}"]`);
  }

  function readForm() {
    const data = {};
    new FormData($('#rollupForm')).forEach((value, key) => data[key] = value);
    return data;
  }

  function saveForm() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(readForm())); } catch (_) {}
  }

  function loadForm() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) {}
    if (!saved || typeof saved !== 'object') return;
    Object.entries(saved).forEach(([key, value]) => {
      const input = $(`[name="${CSS.escape(key)}"]`, $('#rollupForm'));
      if (input) input.value = value;
    });
  }

  function calculateRollup() {
    const ticketRevenue = number($('#ticketRevenue').value);
    const otherIncome = number($('#otherIncome').value);
    const productionCosts = number($('#productionCosts').value);
    const advertisingCosts = number($('#advertisingCosts').value);
    const companyOverhead = number($('#companyOverhead').value);
    const contingencyRate = Math.max(0, number($('#contingencyPercent').value)) / 100;
    const taxRate = Math.min(1, Math.max(0, number($('#taxReservePercent').value) / 100));
    const averageTicketPrice = number($('#averageTicketPrice').value);

    const revenue = ticketRevenue + otherIncome;
    const baseCosts = productionCosts + advertisingCosts + companyOverhead;
    const contingency = baseCosts * contingencyRate;
    const breakEven = baseCosts + contingency;
    const preTax = revenue - breakEven;
    const taxReserve = Math.max(0, preTax) * taxRate;
    const net = preTax - taxReserve;
    const margin = revenue > 0 ? net / revenue * 100 : 0;
    const roi = breakEven > 0 ? net / breakEven * 100 : 0;
    const breakEvenTickets = averageTicketPrice > 0 ? Math.ceil(Math.max(0, breakEven - otherIncome) / averageTicketPrice) : null;
    const costShare = revenue > 0 ? breakEven / revenue * 100 : 0;

    $('#totalRevenue').textContent = money.format(revenue);
    $('#baseCosts').textContent = money.format(baseCosts);
    $('#contingencyAmount').textContent = money.format(contingency);
    $('#preTaxProfit').textContent = money.format(preTax);
    $('#netProfit').textContent = money.format(net);
    $('#profitMargin').textContent = `${percent.format(margin)}%`;
    $('#returnOnCost').textContent = `${percent.format(roi)}%`;
    $('#breakEvenRevenue').textContent = money.format(breakEven);
    $('#breakEvenTickets').textContent = breakEvenTickets == null ? '—' : breakEvenTickets.toLocaleString('en-IE');
    $('#costShare').textContent = `${percent.format(costShare)}% of revenue`;
    $('#costBarFill').style.width = `${Math.min(100, Math.max(0, costShare))}%`;

    const card = $('#profitResultCard');
    const signal = $('#profitSignal');
    card.classList.toggle('is-negative', net < 0);
    if (net < 0) signal.textContent = `Funding gap: ${money.format(Math.abs(net))}`;
    else if (margin < 10) signal.textContent = 'Positive, but with a thin safety margin';
    else signal.textContent = `Commercially positive after a ${money.format(taxReserve)} tax reserve`;

    saveForm();
  }

  function exportSummary() {
    const values = readForm();
    const rows = [
      ['Producer OS — Company Summary', ''],
      ['Project', values.projectName || 'Untitled'],
      ['Generated', new Date().toLocaleString()],
      ['', ''],
      ['Ticket revenue', $('#totalRevenue').textContent],
      ['Base costs', $('#baseCosts').textContent],
      ['Contingency', $('#contingencyAmount').textContent],
      ['Pre-tax profit', $('#preTaxProfit').textContent],
      ['Tax reserve', money.format(Math.max(0, number($('#preTaxProfit').textContent.replace(/[^0-9.-]/g, ''))) * Math.min(1, Math.max(0, number($('#taxReservePercent').value) / 100)))],
      ['Estimated net profit', $('#netProfit').textContent],
      ['Profit margin', $('#profitMargin').textContent],
      ['Return on cost', $('#returnOnCost').textContent],
      ['Break-even revenue', $('#breakEvenRevenue').textContent],
      ['Break-even tickets', $('#breakEvenTickets').textContent]
    ];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (values.projectName || 'producer-company-summary').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    link.href = url;
    link.download = `${safeName || 'producer-company-summary'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Company summary exported');
  }

  function resetSummary() {
    const defaults = {
      projectName: 'New production', ticketRevenue: 75000, otherIncome: 0,
      productionCosts: 42000, advertisingCosts: 6000, companyOverhead: 3500,
      contingencyPercent: 8, taxReservePercent: 20, averageTicketPrice: 65
    };
    Object.entries(defaults).forEach(([key, value]) => {
      const input = $(`[name="${key}"]`);
      if (input) input.value = value;
    });
    calculateRollup();
    showToast('Company roll-up reset');
  }

  $$('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
  $$('[data-open-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.openView)));
  $('#menuBtn').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  $('#mobileScrim').addEventListener('click', () => setMenu(false));
  $('#rollupForm').addEventListener('input', calculateRollup);
  $('#exportSummaryBtn').addEventListener('click', exportSummary);
  $('#resetSummaryBtn').addEventListener('click', resetSummary);

  $('#reloadBtn').addEventListener('click', () => {
    const frame = currentFrame();
    if (!frame) return;
    const loader = $(`[data-loader="${activeView}"]`);
    if (loader) loader.classList.remove('is-done');
    frame.addEventListener('load', () => loader && loader.classList.add('is-done'), { once: true });
    frame.contentWindow.location.reload();
  });

  $('#newTabBtn').addEventListener('click', () => {
    const module = MODULES[activeView];
    if (module?.path) window.open(module.path, '_blank', 'noopener');
  });

  $('#fullscreenBtn').addEventListener('click', () => {
    const enabled = document.body.classList.toggle('focus-mode');
    $('#fullscreenBtn').textContent = enabled ? 'Exit focus' : 'Focus mode';
  });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setMenu(false);
      if (document.body.classList.contains('focus-mode')) {
        document.body.classList.remove('focus-mode');
        $('#fullscreenBtn').textContent = 'Focus mode';
      }
    }
  });

  window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'dashboard', false));

  loadForm();
  calculateRollup();
  navigate(location.hash.slice(1) || 'dashboard', false);
})();
