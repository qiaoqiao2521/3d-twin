import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
// Resolve the user's existing installation from this project, or explicitly
// anchor resolution at an installed playwright/package.json supplied by them.
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE
  ? resolve(process.env.PLAYWRIGHT_PACKAGE) : import.meta.url);
const { chromium } = require('playwright');
const base = process.env.AUTOMOTIVE_BASE_URL || 'http://127.0.0.1:3105';
const artifacts = process.env.ARTIFACT_DIR || '/tmp/automotive-hub-qa';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: resolve(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) } : {}),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(45000); page.setDefaultNavigationTimeout(45000);
const errors = []; const notFound = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().startsWith(base + '/') && response.status() === 404) notFound.push(response.url()); });
const checks = [];
function check(label, value) { if (!value) throw new Error(label); checks.push(label); console.log('PASS', label); }
const rt = key => page.locator(`#${key}-slot`).evaluate(el => JSON.parse(el.dataset.runtime || '{}'));
async function snapshot(key) {
  await page.evaluate(key => document.querySelector(`#${key}-slot iframe`).contentWindow.postMessage(
    { channel: 'car-atlas-v1', type: 'host.snapshot' }, location.origin), key);
}
try {
  await page.goto(base + '/twins/automotive/index.html');
  await page.waitForFunction(() => JSON.parse(document.querySelector('#vehicle-slot').dataset.runtime || '{}').loadedModelId === 'bmw-m3-e30');
  await page.waitForFunction(() => document.querySelectorAll('.catalog-part').length === 23);
  await page.waitForFunction(() => JSON.parse(document.querySelector('#vehicle-slot').dataset.runtime).bindingRuleMeshCount > 0);
  check('bindings reach actual renderer', (await rt('vehicle')).bindingRuleMeshCount === 22);
  check('catalogue loads', await page.locator('.catalog-part').count() === 23);
  if (!process.env.ATLAS_LAYOUT_ONLY) {
  const vehicle = page.frameLocator('#vehicle-view');
  await vehicle.getByRole('button', { name: /Painted panel|车漆覆盖件/ }).click();
  await page.waitForFunction(() => document.querySelector('#selection-label').textContent === '车身总成');
  check('native selection resolves real mesh path', await page.locator('#selection-detail').innerText().then(t => t.includes('车身')));
  await page.locator('[data-part="wheel.tire"]').click();
  check('actual tyre meshes mapped', (await page.locator('#selection-detail').innerText()).includes('匹配 4 个网格'));
  await page.getByRole('button', { name: '在整车中单独查看' }).click();
  await page.waitForFunction(() => !document.querySelector('#filter-reset').hidden);
  check('native geometry can be filtered from catalogue', true);
  await page.locator('#filter-reset').click();
  await page.waitForFunction(() => document.querySelector('#filter-reset').hidden);
  await page.locator('[data-part="wheel.tire"]').click();
  await page.locator('[data-relation="wheel-to-power-principle"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#controller-controls [data-param]').length === 6);
  check('principle relation stays explicit', (await page.locator('#atlas-status').innerText()).includes('非当前车型'));
  await page.waitForFunction(() => JSON.parse(document.querySelector('#vehicle-slot').dataset.runtime).active === false);
  const v1 = (await rt('vehicle')).renderedFrames;
  await page.waitForTimeout(300); await snapshot('vehicle'); await page.waitForTimeout(100);
  check('hidden vehicle RAF stopped', (await rt('vehicle')).renderedFrames === v1);
  await page.locator('#controller-panel summary').click();
  await page.locator('[data-param="rpm"]').evaluate(el => { el.value = '2300'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  const engineFrame = page.frames().find(frame => frame.url().includes('/twins/automotive/v8/integrated.html'));
  await engineFrame.waitForFunction(() => window.__v8.state.rpm === 2300);
  check('RPM applied to actual engine state', await engineFrame.evaluate(() => window.__v8.state.rpm === 2300));
  await engineFrame.locator('#btnLearn').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('#engine-slot').dataset.runtime).mode === 'learning');
  await page.locator('[data-transport="pause"]').click();
  await engineFrame.waitForFunction(() => !window.__v8.state.learning && !window.__v8.state.playing);
  const theta = await engineFrame.evaluate(() => window.__v8.state.theta);
  await page.waitForTimeout(300);
  check('pause exits lesson and stops actual crank', await engineFrame.evaluate(t => window.__v8.state.theta === t, theta));
  await engineFrame.locator('#btnExplode').evaluate(button => button.click());
  await page.waitForFunction(() => document.querySelector('[data-param="explode"]').checked);
  check('native button changes propagate', true);
  await page.locator('[data-view="vehicle"]').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('#engine-slot').dataset.runtime).active === false);
  const e1 = (await rt('engine')).renderedFrames;
  await page.waitForTimeout(300); await snapshot('engine'); await page.waitForTimeout(100);
  check('hidden engine loop stopped', (await rt('engine')).renderedFrames === e1);
  await page.locator('[data-view="engine"]').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('#engine-slot').dataset.runtime).active === true);
  check('engine state survives resume', await engineFrame.evaluate(() => window.__v8.state.rpm === 2300 && window.__v8.state.explode));
  await page.locator('[data-view="systems"]').click();
  check('external view mounts', await page.locator('#systems-slot iframe').count() === 1);
  await page.locator('[data-view="vehicle"]').click();
  check('external view released on leave', await page.locator('#systems-slot iframe').count() === 0);
  await vehicle.getByRole('button', { name: 'Model 3', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('#vehicle-slot').dataset.runtime).loadedModelId === 'tesla-model-3');
  await page.waitForFunction(() => JSON.parse(document.querySelector('#vehicle-slot').dataset.runtime).bindingRuleMeshCount === 0);
  check('model switch clears BMW rules for Model 3', (await rt('vehicle')).appliedRuleCount === 0);
  await vehicle.getByRole('button', { name: 'BMW M3', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('#vehicle-slot').dataset.runtime).loadedModelId === 'bmw-m3-e30' && JSON.parse(document.querySelector('#vehicle-slot').dataset.runtime).bindingRuleMeshCount === 22);
  await page.locator('#catalog-mode').selectOption('structure');
  check('assembly tree independent of systems', (await page.locator('#catalog-list').innerText()).includes('装配于'));
  await page.locator('#catalog-mode').selectOption('systems');
  await page.locator('#system-filter').selectOption('electrical.ignition');
  check('cross-system part searchable', (await page.locator('#catalog-list').innerText()).includes('火花塞'));
  check('no script errors', errors.length === 0);
  check('no local 404 responses', notFound.length === 0);
  await page.locator('#system-filter').selectOption('');
  }
  await page.screenshot({ path: join(artifacts, 'workbench.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  check('mobile shell has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(artifacts, 'workbench-mobile.png') });
  const receipt = { passed: checks.length, checks, errors, notFound };
  await writeFile(join(artifacts, 'browser-result.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  await page.screenshot({ path: join(artifacts, 'qa-failure.png'), timeout: 10000 }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
