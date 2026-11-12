/**
 * A production `next start` for the admin UI tests, wired so it can't reach
 * production or any real third party:
 *   - a clean environment (nothing inherited from the shell), with
 *     __NEXT_PROCESSED_ENV=true so Next never loads .env / .env.local, and every
 *     key those files define set to a local value or a dummy;
 *   - DATABASE_URL = the local test database;
 *   - HTTP(S)_PROXY → a local recorder that refuses and logs every outbound
 *     request (NODE_USE_ENV_PROXY makes Node's http/https/fetch honour it), so a
 *     test can assert that nothing tried to leave the machine.
 */
import { spawn, type ChildProcess } from "child_process";
import http from "http";
import net from "net";
import path from "path";
import { E2E_ENV, assertLocalDatabaseUrl } from "../env";

const root = path.resolve(__dirname, "../../..");

export interface Outbound {
  url: string;
  method: string;
}

export interface Recorder {
  url: string;
  requests: Outbound[];
  close(): Promise<void>;
}

/** Local proxy that records and refuses everything. */
export async function startOutboundRecorder(): Promise<Recorder> {
  const requests: Outbound[] = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method ?? "?", url: req.url ?? "" });
    res.writeHead(502, { "content-type": "text/plain" }).end("e2e: outbound requests are blocked");
  });
  server.on("connect", (req, socket: net.Socket) => {
    requests.push({ method: "CONNECT", url: req.url ?? "" });
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

/** Environment for `next build` / `next start`. */
export function nextEnv(proxyUrl: string, port: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    LANG: "en_US.UTF-8",
    ...E2E_ENV,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    // Never read .env / .env.local (they hold production credentials).
    __NEXT_PROCESSED_ENV: "true",
    // Every other key those files define, neutralised.
    ADMIN_EMAIL: "",
    NEXTAUTH_URL: `http://localhost:${port}`,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_e2e_dummy",
    OPENROUTER_API_KEY: "",
    RESEND_AUDIENCE_ID: "",
    RESEND_FROM: "",
    STRIPE_WEBHOOK_SECRET: "",
    RESEND_BASE_URL: `${proxyUrl}/resend`,
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    NO_PROXY: "localhost,127.0.0.1,.localhost",
    no_proxy: "localhost,127.0.0.1,.localhost",
    NODE_USE_ENV_PROXY: "1",
  };
  assertLocalDatabaseUrl(env.DATABASE_URL);
  return env;
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} ${args.join(" ")} timed out\n${out.slice(-4000)}`));
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${out.slice(-6000)}`));
    });
  });
}

export async function buildApp(proxyUrl: string): Promise<string> {
  const bin = path.join(root, "node_modules/.bin/next");
  return run(bin, ["build", "--webpack"], nextEnv(proxyUrl, 0), 20 * 60_000);
}

export interface RunningServer {
  baseUrl: string;
  port: number;
  logs: () => string;
  stop(): Promise<void>;
}

export async function startApp(proxyUrl: string, port: number): Promise<RunningServer> {
  const bin = path.join(root, "node_modules/.bin/next");
  const child: ChildProcess = spawn(bin, ["start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: root,
    env: nextEnv(proxyUrl, port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout!.on("data", (d) => (out += d));
  child.stderr!.on("data", (d) => (out += d));
  const baseUrl = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next start exited ${child.exitCode}\n${out}`);
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/admin/login`, (res) => {
          res.resume();
          resolve((res.statusCode ?? 0) > 0);
        });
        req.on("error", () => resolve(false));
      });
      if (ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      child.kill("SIGKILL");
      throw new Error(`next start did not come up\n${out}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return {
    baseUrl,
    port,
    logs: () => out,
    stop: () =>
      new Promise((r) => {
        if (child.exitCode !== null) return r();
        child.once("exit", () => r());
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000);
      }),
  };
}
