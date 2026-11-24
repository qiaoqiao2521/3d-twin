import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Resolve the user's existing installation from this project, or explicitly
// anchor resolution at an installed playwright/package.json supplied by them.
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE
  ? path.resolve(process.env.PLAYWRIGHT_PACKAGE) : import.meta.url);
const { chromium } = require('playwright');
const base = process.env.AUTOMOTIVE_BASE_URL || 'http://127.0.0.1:3105';
const artifacts = process.env.ARTIFACT_DIR || '/tmp/automotive-hub-qa';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: path.resolve(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) } : {}),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(60000);
const errors = [], missing = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (response.url().startsWith(base + '/twins/automotive/') && response.status() === 404) missing.push(response.url());
});
try {
  await page.goto(base + '/');
  await page.getByRole('button', { name: '汽车整车 · V8' }).click();
  await page.waitForURL(/mode=automotive/);
  const outer = page.locator('iframe[title="汽车整车拆解与 5.7L V8 发动机数字孪生"]');
  await outer.waitFor();
  const workbench = await (await outer.elementHandle()).contentFrame();
  await workbench.waitForFunction(() => JSON.parse(document.querySelector('#vehicle-slot').dataset.runtime || '{}').loadedModelId === 'bmw-m3-e30');
  const vehicle = await (await workbench.locator('#vehicle-view').elementHandle()).contentFrame();
  for (const [button, id] of [['Model 3', 'tesla-model-3']]) {
    await vehicle.getByRole('button', { name: button, exact: true }).click();
    await workbench.waitForFunction(id => JSON.parse(document.querySelector('#vehicle-slot').dataset.runtime || '{}').loadedModelId === id, id);
    console.log(`PASS loaded ${id}`);
  }
  await page.screenshot({ path: path.join(artifacts, 'hub-tesla.png') });
  await workbench.locator('[data-view="engine"]').click();
  await workbench.waitForFunction(() => document.querySelectorAll('#controller-controls [data-param]').length === 6);
  const engine = await (await workbench.locator('#engine-view').elementHandle()).contentFrame();
  await engine.waitForFunction(() => !!window.__v8?.state);
  await page.screenshot({ path: path.join(artifacts, 'hub-v8.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Hub horizontal overflow on mobile');
  if (errors.length || missing.length) throw new Error(JSON.stringify({ errors, missing }));
  console.log('PASS Hub navigation, V8 canvas, mobile width; 0 script errors and local 404 responses');
} finally {
  await browser.close();
}
