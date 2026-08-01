#!/usr/bin/env python3
"""Automated browser tests for Stage Economics.

Requires Python 3 and Playwright for Python. The test loads the local files directly
into Chromium, so no web server or internet connection is required.
"""
from __future__ import annotations

import math
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def build_page(page) -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="styles.css" />', "")
    html = html.replace('<script src="plotly.min.js"></script>', "")
    html = html.replace('<script src="app.js"></script>', "")
    page.set_content(html, wait_until="domcontentloaded", timeout=120_000)
    page.add_style_tag(content=(ROOT / "styles.css").read_text(encoding="utf-8"))
    page.add_script_tag(content=(ROOT / "plotly.min.js").read_text(encoding="utf-8"))
    page.add_script_tag(content=(ROOT / "app.js").read_text(encoding="utf-8"))
    page.wait_for_function("window.StageEconomicsTestApi && window.StageEconomicsTestApi.app.model", timeout=120_000)


def set_value(page, field_id: str, value) -> None:
    page.evaluate(
        """([id, value]) => {
          const el = document.getElementById(id);
          if (!el) throw new Error(`Unknown field ${id}`);
          if (el.type === 'checkbox') el.checked = Boolean(value);
          else el.value = value;
        }""",
        [field_id, value],
    )


def recalc(page) -> bool:
    return bool(page.evaluate("window.StageEconomicsTestApi.recalculate(false)"))


def reset(page) -> None:
    page.click("#resetBtn")
    set_value(page, "autoUpdate", False)
    recalc(page)
    page.wait_for_timeout(50)


def close(a: float, b: float, tol: float = 1e-9) -> bool:
    return math.isfinite(a) and math.isfinite(b) and abs(a - b) <= tol


def main() -> int:
    failures: list[str] = []
    passes: list[str] = []

    def check(condition: bool, name: str, detail: str = "") -> None:
        if condition:
            passes.append(name)
        else:
            failures.append(f"{name}{': ' + detail if detail else ''}")

    source = (ROOT / "app.js").read_text(encoding="utf-8")
    check("STORAGE_VERSION = 3" in source and "stage-economics-calculator-v3" in source, "localStorage versioning")
    check("max=\"200000\"" not in (ROOT / "index.html").read_text(encoding="utf-8"), "artificial upper limits removed")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path="/usr/bin/chromium" if Path("/usr/bin/chromium").exists() else None,
            args=["--no-sandbox", "--disable-web-security"],
        )
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        js_errors: list[str] = []
        page.on("pageerror", lambda error: js_errors.append(str(error)))
        page.on("console", lambda message: js_errors.append(message.text) if message.type == "error" else None)
        build_page(page)
        set_value(page, "autoUpdate", False)
        recalc(page)

        check(page.evaluate("StageEconomicsTestApi.app.scenarios.length") == 216, "default 216 scenarios")
        check(page.locator("#occupancyTableBody tr").count() == 21, "occupancy table has 21 rows")

        # Rounding upward to €0.10.
        values = page.evaluate("[StageEconomicsTestApi.ceil01(0), StageEconomicsTestApi.ceil01(1.01), StageEconomicsTestApi.ceil01(1.1), StageEconomicsTestApi.ceil01(42.75)]")
        check(values == [0, 1.1, 1.1, 42.8], "roundup €0.10", repr(values))

        # All three venue modes.
        expected = {"a": 100.0, "b": 121.0, "c": 183.4}
        for mode, target in expected.items():
            reset(page)
            set_value(page, "venueRent", 100)
            set_value(page, "venueMode", mode)
            check(recalc(page), f"venue mode {mode} recalculates")
            actual = page.evaluate("StageEconomicsTestApi.app.model.venue")
            check(close(actual, target), f"venue mode {mode} formula", f"expected {target}, got {actual}")

        # K=1 and K=1.25, with the working price rounded before calculation.
        for k in (1, 1.25):
            reset(page)
            set_value(page, "kCoefficient", k)
            set_value(page, "useKPrice", True)
            check(recalc(page), f"K={k} recalculates")
            result = page.evaluate("({be: StageEconomicsTestApi.app.model.dynamicBreakEven, price: StageEconomicsTestApi.app.inputs.analysisBasePrice})")
            expected_price = math.ceil((result["be"] * k - 1e-9) * 10) / 10
            check(close(result["price"], expected_price), f"K={k} rounded working price", repr(result))

        # Empty field must not overwrite the last valid model.
        reset(page)
        set_value(page, "useKPrice", False)
        set_value(page, "analysisBasePrice", 42.75)
        recalc(page)
        previous = page.evaluate("StageEconomicsTestApi.app.inputs.analysisBasePrice")
        set_value(page, "analysisBasePrice", "")
        ok = recalc(page)
        current = page.evaluate("StageEconomicsTestApi.app.inputs.analysisBasePrice")
        check(not ok and close(previous, current), "empty input preserves last valid result")
        check("поле не заполнено" in page.locator("#validationBanner").inner_text(), "empty input shows explicit error")

        # Very large values are not silently truncated.
        reset(page)
        set_value(page, "venueRent", 1_000_000_000_000)
        set_value(page, "hotellingEnabled", False)
        set_value(page, "useKPrice", False)
        set_value(page, "analysisBasePrice", 35)
        set_value(page, "scenarioGridMode", "price")
        check(recalc(page), "large value recalculates")
        large = page.evaluate("({input: StageEconomicsTestApi.app.inputs.venueRent, venue: StageEconomicsTestApi.app.model.venue})")
        check(large["input"] == 1_000_000_000_000 and large["venue"] == 1_000_000_000_000, "large value not clamped", repr(large))

        # Manual price rounding before all scenario calculations.
        reset(page)
        set_value(page, "useKPrice", False)
        set_value(page, "analysisBasePrice", 42.75)
        recalc(page)
        check(close(page.evaluate("StageEconomicsTestApi.app.inputs.analysisBasePrice"), 42.8), "manual price rounded before calculations")

        # Former business maxima are no longer enforced.
        reset(page)
        set_value(page, "kCoefficient", 3)
        set_value(page, "hotellingRate", 50)
        set_value(page, "digitalDaily", 1000)
        check(recalc(page), "values above former maxima recalculate")
        unlocked = page.evaluate("({k: StageEconomicsTestApi.app.inputs.kCoefficient, hotelling: StageEconomicsTestApi.app.inputs.hotellingRate, digital: StageEconomicsTestApi.app.inputs.digitalDaily, valid: StageEconomicsTestApi.app.model.valid})")
        check(unlocked["k"] == 3 and close(unlocked["hotelling"], 0.5) and unlocked["digital"] == 1000 and unlocked["valid"], "former K/hotelling/digital limits removed", repr(unlocked))

        # Ticketmaster base selection changes only the commission basis.
        reset(page)
        set_value(page, "useKPrice", False)
        set_value(page, "analysisBasePrice", 35)
        set_value(page, "scenarioGridMode", "price")
        set_value(page, "hotellingEnabled", False)
        set_value(page, "tmRate", 10)
        set_value(page, "tmBase", "net")
        recalc(page)
        tm_net = page.evaluate("StageEconomicsTestApi.scenarioAt(StageEconomicsTestApi.app.inputs, StageEconomicsTestApi.app.model, 35, 100).tmCommission")
        set_value(page, "tmBase", "gross")
        recalc(page)
        tm_gross = page.evaluate("StageEconomicsTestApi.scenarioAt(StageEconomicsTestApi.app.inputs, StageEconomicsTestApi.app.model, 35, 100).tmCommission")
        check(tm_gross > tm_net, "Ticketmaster basis selector", f"net={tm_net}, gross={tm_gross}")

        # Disabled dependencies preserve their values.
        original_hours = page.input_value("#rehearsalHours")
        set_value(page, "rehearsalEnabled", False)
        recalc(page)
        check(page.locator("#rehearsalHours").is_disabled(), "rehearsal field is truly disabled")
        set_value(page, "rehearsalEnabled", True)
        recalc(page)
        check(not page.locator("#rehearsalHours").is_disabled() and page.input_value("#rehearsalHours") == original_hours, "disabled field preserves value")

        # Calendar-day arithmetic is DST-independent.
        diff = page.evaluate("StageEconomicsTestApi.calendarDayDifference('2026-03-30', '2026-03-28')")
        check(diff == 2, "calendar-day difference ignores DST")

        # Zero sold tickets: explicit message and no Infinity/NaN.
        reset(page)
        set_value(page, "useKPrice", False)
        set_value(page, "analysisBasePrice", 35)
        set_value(page, "scenarioGridMode", "price")
        set_value(page, "seats", 1)
        set_value(page, "baseOccupancy", 35)
        recalc(page)
        page.evaluate("StageEconomicsTestApi.renderChartForTests(6)")
        page.wait_for_timeout(500)
        check("Невозможно рассчитать при 0 проданных билетов" in page.locator("#chart-6").inner_text(), "zero-ticket IN-03 message")
        check(page.evaluate("StageEconomicsTestApi.getNonFiniteChartIds().length") == 0, "zero-ticket charts contain no NaN/Infinity")

        # No finite hotelling solution.
        reset(page)
        set_value(page, "hotellingRate", 200)
        recalc(page)
        hotelling_result = page.evaluate("({valid: StageEconomicsTestApi.app.model.valid, reason: StageEconomicsTestApi.app.model.failureReason, scenarios: StageEconomicsTestApi.app.scenarios.length})")
        check(not hotelling_result["valid"] and hotelling_result["scenarios"] == 0 and "Конечная цена не существует" in hotelling_result["reason"], "hotelling solver detects no finite solution", repr(hotelling_result))

        # K unavailable when price growth cannot cover deductions.
        reset(page)
        set_value(page, "hotellingRate", 0)
        set_value(page, "tmBase", "gross")
        set_value(page, "tmRate", 99.999)
        set_value(page, "useKPrice", True)
        recalc(page)
        k_unavailable = page.evaluate("({be: StageEconomicsTestApi.app.model.dynamicBreakEven, k: StageEconomicsTestApi.app.inputs.kPrice, scenarios: StageEconomicsTestApi.app.scenarios.length, reason: StageEconomicsTestApi.app.model.dynamicBreakEvenReason})")
        check(k_unavailable["be"] is None and k_unavailable["scenarios"] == 0 and "не существует" in k_unavailable["reason"], "K unavailable is explicit", repr(k_unavailable))
        check(page.locator("#kpiDynamicBreakEven").inner_text() == "K недоступен", "K unavailable KPI label")

        # All positives plus only the twelve closest negative scenarios.
        reset(page)
        recalc(page)
        counts = page.evaluate("""(() => {
          const all = StageEconomicsTestApi.app.scenarios;
          const shown = StageEconomicsTestApi.filteredScenarios();
          return {
            allPositive: all.filter(s => s.positive).length,
            allNegative: all.filter(s => !s.positive).length,
            shownPositive: shown.filter(s => s.positive).length,
            shownNegative: shown.filter(s => !s.positive).length,
          };
        })()""")
        check(counts["shownPositive"] == counts["allPositive"], "all positive scenarios are shown", repr(counts))
        check(counts["shownNegative"] == min(12, counts["allNegative"]), "only 12 closest negative scenarios are shown", repr(counts))

        # Sorting in both directions.
        page.click('[data-sort="price"]')
        first_desc = page.locator("#scenarioTableBody tr td:nth-child(2)").first.inner_text()
        page.click('[data-sort="price"]')
        first_asc = page.locator("#scenarioTableBody tr td:nth-child(2)").first.inner_text()
        check(first_desc != first_asc and "цена" in page.locator("#sortStatus").inner_text().lower(), "column sorting toggles direction")

        # MCDA import parser.
        weights_json = '{"type":"weights","runs":[' + ','.join(['[1,1,1,1,1]'] * 25) + ']}'
        mcda_type = page.evaluate("text => StageEconomicsTestApi.parseMcdaText(text, 'weights.json').type", weights_json)
        check(mcda_type == "weights", "MCDA 25x5 import parser")

        # Full default render: 25 Plotly panels, no JS errors, no NaN/Infinity.
        reset(page)
        recalc(page)
        page.evaluate("StageEconomicsTestApi.renderAllChartsForTests()")
        page.wait_for_timeout(3_000)
        check(page.locator(".js-plotly-plot").count() == 25, "all 25 Plotly panels render")
        check(page.locator(".chart-error").count() == 0, "no chart render errors")
        check(page.evaluate("StageEconomicsTestApi.getNonFiniteChartIds().length") == 0, "all charts contain no NaN/Infinity")
        check(not js_errors, "no JavaScript errors", repr(js_errors))

        browser.close()

    for name in passes:
        print(f"PASS  {name}")
    for failure in failures:
        print(f"FAIL  {failure}")
    print(f"\nResult: {len(passes)} passed, {len(failures)} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
