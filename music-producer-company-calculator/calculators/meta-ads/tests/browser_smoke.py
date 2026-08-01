from pathlib import Path
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text(encoding="utf-8")
html = re.sub(r'<link[^>]+styles\.css[^>]*>', '', html)
html = re.sub(r'<script[^>]+src="[^"]+"[^>]*></script>', '', html)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.set_content(html)
    page.add_style_tag(path=str(ROOT / "styles.css"))
    for name in ["data.js", "model.js", "charts.js", "tests.js", "app.js"]:
        page.add_script_tag(path=str(ROOT / name))
    page.wait_for_timeout(500)

    assert page.locator("#impressionsValue").inner_text() != "—"
    assert page.locator("#visitsValue").inner_text() != "—"
    assert page.locator(".plot svg").count() == 5

    page.locator("#budget").fill("1000000")
    page.locator("#duration").fill("10000")
    page.locator("#radius").fill("100")
    page.wait_for_timeout(500)
    assert "—" not in page.locator("#impressionsValue").inner_text()

    page.locator('[data-tab="dataPane"]').click()
    page.locator("#testBtn").click()
    assert page.locator("#testStatus").inner_text() == "10 passed, 0 failed"
    assert not errors, errors
    browser.close()

print("browser smoke test passed")
