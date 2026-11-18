// Minimal Chrome DevTools driver on Node's standard library only: launches the cached
// Playwright Chromium headless, talks CDP over a WebSocket, and offers the few calls a
// play-test needs — navigate, evaluate, key presses, screenshots, console + page errors.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

export const CHROME = process.env.CHROME_PATH
  || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');

const KEY_CODES = {
  KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, KeyE: 69, KeyP: 80, KeyM: 77, KeyC: 67,
  Enter: 13, Space: 32, Escape: 27, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
};

export async function launchChrome(port, userDataDir) {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1280,800',
    '--autoplay-policy=no-user-gesture-required',
    '--user-data-dir=' + userDataDir,
    '--remote-debugging-port=' + port,
    'about:blank',
  ], { stdio: 'ignore' });
  // Wait until the DevTools HTTP endpoint answers.
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/version');
      if (res.ok) return chrome;
    } catch {
      // Not up yet.
    }
    await sleep(200);
  }
  throw new Error('chromium did not start on port ' + port);
}

export async function openTab(port, url) {
  const res = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let nextId = 1;
  const pending = new Map();
  const consoleMessages = [];
  const pageErrors = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      consoleMessages.push(msg.params.type + ': ' + text);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description ?? ''));
    } else if (msg.method === 'Log.entryAdded') {
      if (msg.params.entry.level === 'error') consoleMessages.push('log-error: ' + msg.params.entry.text);
    }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  return {
    send,
    consoleMessages,
    pageErrors,
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error('evaluate failed: ' + JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    async key(code, down) {
      const keyName = code === 'Space' ? ' ' : code.replace(/^Key/, '').replace(/^Arrow/, '').toLowerCase();
      await send('Input.dispatchKeyEvent', {
        type: down ? 'keyDown' : 'keyUp',
        code,
        key: code === 'Enter' ? 'Enter' : code === 'Escape' ? 'Escape' : keyName,
        windowsVirtualKeyCode: KEY_CODES[code] || 0,
      });
    },
    async tap(code, ms) {
      await this.key(code, true);
      await sleep(ms ?? 80);
      await this.key(code, false);
    },
    async hold(code) {
      await this.key(code, true);
    },
    async release(code) {
      await this.key(code, false);
    },
    async screenshot(path) {
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(path, Buffer.from(shot.data, 'base64'));
    },
    close() {
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    },
  };
}
