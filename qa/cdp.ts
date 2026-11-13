// Tiny Chrome DevTools helper for local checks (not part of the app).
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const CHROME = process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
  : "/usr/bin/google-chrome";

export async function launch(port = 9333): Promise<{ proc: ChildProcess; page: Page; tempDir: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "printcv-qa-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      "--no-first-run",
      "--window-size=1440,900",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  let tabs: any[] = [];
  for (let i = 0; i < 50; i++) {
    try {
      tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (tabs.find((t) => t.type === "page")) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const tab = tabs.find((t) => t.type === "page");
  if (!tab) {
    try { proc.kill(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    throw new Error("Could not find Chrome page tab via CDP.");
  }
  const page = new Page(tab.webSocketDebuggerUrl);
  await page.open();
  return { proc, page, tempDir: dir };
}

export class Page {
  ws!: WebSocket;
  id = 1;
  pending = new Map<number, any>();
  logs: string[] = [];
  handlers = new Map<string, Array<(params: any) => void>>();

  constructor(private url: string) {}

  on(event: string, handler: (params: any) => void): void {
    const list = this.handlers.get(event) || [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  open() {
    return new Promise<void>((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(e);
      this.ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data));
        if (m.id && this.pending.has(m.id)) {
          const p = this.pending.get(m.id);
          this.pending.delete(m.id);
          m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
        }
        if (m.method) {
          const hs = this.handlers.get(m.method);
          if (hs) {
            for (const h of hs) {
              try { h(m.params); } catch (e) { console.error("Event handler error:", e); }
            }
          }
        }
        if (m.method === "Runtime.exceptionThrown") {
          this.logs.push("EXCEPTION " + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
        }
        if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) {
          this.logs.push(m.params.type + " " + m.params.args.map((a: any) => a.value ?? a.description).join(" "));
        }
      };
    });
  }

  close(): void {
    try {
      if (this.ws) this.ws.close();
    } catch {}
  }
  send(method: string, params: any = {}): Promise<any> {
    const id = this.id++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  async eval<T = any>(expr: string): Promise<T> {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  async goto(url: string, wait = 2500) { await this.send("Page.navigate", { url }); await new Promise((r) => setTimeout(r, wait)); }
  async shot(file: string, full = false) {
    const r = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
    fs.writeFileSync(file, Buffer.from(r.data, "base64"));
  }
  async viewport(width: number, height: number, mobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  }
}
