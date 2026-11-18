// Takes the game's screenshots: opens each ?shot= scene from shots.json in headless Chrome,
// waits for window.__shotReady, and saves a JPEG into screenshots/. Usage:
//   node tools/shots.mjs [port]   (defaults to http://127.0.0.1:8080, the `node serve.ts` port)
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { launchChrome, openTab } from './cdp.mjs';

const port = Number(process.argv[2] || 8080);
const shots = JSON.parse(readFileSync(new URL('../shots.json', import.meta.url), 'utf8'));
const userDataDir = '/tmp/solmar-shots-profile';
rmSync(userDataDir, { recursive: true, force: true });
mkdirSync(new URL('../screenshots', import.meta.url), { recursive: true });

const chrome = await launchChrome(9223, userDataDir);
try {
  for (const shot of shots) {
    const tab = await openTab(9223, 'http://127.0.0.1:' + port + '/' + shot.query);
    let ready = false;
    for (let i = 0; i < 100; i += 1) {
      await sleep(150);
      ready = await tab.evaluate('window.__shotReady === true').catch(() => false);
      if (ready) break;
    }
    if (!ready) {
      console.log('NOT READY: ' + shot.name);
      tab.close();
      continue;
    }
    const out = new URL('../screenshots/' + shot.name, import.meta.url);
    await tab.screenshot(out);
    const { statSync } = await import('node:fs');
    const size = statSync(out).size;
    console.log('saved ' + shot.name + ' (' + size + ' bytes)');
    tab.close();
  }
} finally {
  chrome.kill();
}
console.log('done');
