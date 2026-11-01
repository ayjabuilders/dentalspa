import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

// Compile the actual primitive into an isolated, synthetic browser fixture.
// Reuse the compiler already installed through Vitest/Vite; no server is started.
const require = createRequire(import.meta.url);
const viteRequire = createRequire(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
const { build } = viteRequire('esbuild');
const root = resolve(import.meta.dirname, '..');
const compiled = await build({
  stdin: { resolveDir: resolve(root, 'apps/clinic-os'), sourcefile: 'sheet-fixture.tsx', loader: 'tsx', contents: `
    import React, {useRef, useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {Modal, ClinicDesignProvider} from '../../packages/ui-clinic/src/index';
    function App() {
      const [open,setOpen]=useState(false), [locked,setLocked]=useState(false);
      const [sheet,setSheet]=useState(true), [theme,setTheme]=useState('light');
      const target=useRef(null);
      return <ClinicDesignProvider value={{design:'pearl',theme}}>
        <button ref={target} onClick={()=>setOpen(true)}>Open fixture</button>
        <button onClick={()=>setSheet(!sheet)}>Toggle presentation</button>
        <button onClick={()=>setTheme(theme==='light'?'dark':'light')}>Toggle theme</button>
        <Modal open={open} onOpenChange={setOpen} closeDisabled={locked} returnFocus={target.current}
          mobilePresentation={sheet?'sheet':'dialog'} className="workspace-dialog"
          title="Synthetic mobile sheet" description="Synthetic fixture only">
          <button onClick={()=>setLocked(!locked)}>{locked?'Unlock':'Lock'}</button>
          <label>Fixture field<input aria-label="Fixture field"/></label>
          <div style={{height:1000}}>Long synthetic content</div>
          <button>Last action</button>
        </Modal>
      </ClinicDesignProvider>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  ` },
  bundle: true, write: false, outfile: 'fixture.js', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const script = compiled.outputFiles.find(file => file.path.endsWith('.js')).text;
const sheetCss = compiled.outputFiles.find(file => file.path.endsWith('.css')).text;
// Load application styles after the primitive CSS to catch specificity regressions.
const appCss = [
  'packages/design-tokens/theme.css', 'packages/design-tokens/pearl.css',
  'apps/clinic-os/app/globals.css', 'apps/clinic-os/app/connection/pearl-connected.css',
  'apps/clinic-os/components/connected-workspace/workspace-chrome.css',
].map(file => readFileSync(resolve(root, file), 'utf8')).join('\n');
mkdirSync(resolve(root, '.local/qa'), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<main id="root"></main>');
  await page.addStyleTag({ content: sheetCss + '\n' + appCss });
  await page.addScriptTag({ content: script });
  const opener = page.getByRole('button', { name: 'Open fixture', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Synthetic mobile sheet', exact: true });
  const close = dialog.getByRole('button', { name: 'Fermer', exact: true });
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Toggle theme' }).click();
    for (const width of [320, 390, 430, 700]) {
      await page.setViewportSize({ width, height: 844 });
      await opener.click();
      await expect(dialog).toHaveAttribute('data-theme', theme);
      await expect(dialog).toHaveCSS('transform', 'none');
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, 'Sheet stays within mobile width');
      assert.ok(bounds.y >= 11 && bounds.y + bounds.height <= 845, 'Sheet stays inside visible height');
      await expect(dialog.getByLabel('Fixture field')).toHaveCSS('font-size', '16px');
      await expect(close).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.getByRole('button', { name: 'Last action' })).toBeFocused();
      await expect(close).toBeInViewport();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.screenshot({ path: resolve(root, `.local/qa/shared-mobile-sheet-${theme}-${width}.png`) });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await opener.click();
  await dialog.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(close).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 3);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Unlock', exact: true }).click();
  await close.click();
  await expect(opener).toBeFocused();

  // Simulate keyboard resize + visual viewport pan, including nonzero offsetTop.
  await page.evaluate(() => {
    const viewport = new globalThis.EventTarget();
    Object.assign(viewport, { height: 480, offsetTop: 24 });
    Object.defineProperty(globalThis, 'visualViewport', { configurable: true, value: viewport });
  });
  await opener.click();
  await expect(dialog).toHaveCSS('bottom', '340px');
  await expect(dialog).toHaveCSS('max-height', '468px');
  await page.evaluate(() => {
    Object.assign(globalThis.visualViewport, { height: 400, offsetTop: 40 });
    globalThis.visualViewport.dispatchEvent(new globalThis.Event('scroll'));
    globalThis.visualViewport.dispatchEvent(new globalThis.Event('resize'));
  });
  await expect(dialog).toHaveCSS('bottom', '404px');
  await expect(dialog).toHaveCSS('max-height', '388px');
  await expect(close).toBeInViewport();
  await close.click();
  await page.evaluate(() => { delete globalThis.visualViewport; });

  // Opt-in mode has exactly the original dialog geometry above the breakpoint.
  for (const width of [701, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await opener.click();
    await expect(dialog).toHaveCSS('animation-name', 'dialog-in');
    await page.waitForTimeout(260);
    const sheetDesktop = await dialog.boundingBox();
    await close.click();
    await page.getByRole('button', { name: 'Toggle presentation' }).click();
    await opener.click();
    await page.waitForTimeout(260);
    assert.deepEqual(await dialog.boundingBox(), sheetDesktop, 'Opt-in leaves desktop geometry unchanged');
    await close.click();
    await page.getByRole('button', { name: 'Toggle presentation' }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle presentation' }).click();
  await opener.click();
  await expect(dialog).toHaveAttribute('data-mobile-presentation', 'dialog');
  assert.ok((await dialog.boundingBox()).width < 390, 'Default mobile dialog stays centered and inset');
  await close.click();
  await page.getByRole('button', { name: 'Toggle presentation' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await opener.click();
  await expect(dialog).toHaveCSS('animation-name', 'none');
  await close.click();
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log('PASS mobile sheet: light/dark 320/390/430/700, focus trap/return, sticky close, closeDisabled, visualViewport resize/pan, unchanged desktop/default dialogs, reduced motion.');
} finally {
  await browser.close();
}
