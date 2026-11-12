/**
 * Preloaded (NODE_OPTIONS=--require) into `next build` / `next start` for the
 * UI tests. The proxy env vars only catch clients that honour them; the Stripe
 * SDK uses its own HTTPS agent and went straight to api.stripe.com. This
 * refuses EVERY TCP connection to a non-local host at the socket level and
 * appends the target to E2E_BLOCKED_LOG, so the suite can assert that nothing
 * tried to leave the machine.
 */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- a NODE_OPTIONS --require preload must be CommonJS */
const net = require("net");
const tls = require("tls");
const fs = require("fs");

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", undefined, null, ""]);
const logFile = process.env.E2E_BLOCKED_LOG;
const originalConnect = net.Socket.prototype.connect;

function target(args) {
  const a = args[0];
  if (Array.isArray(a)) return target(a);
  if (a && typeof a === "object") return { host: a.host, port: a.port, path: a.path };
  if (typeof a === "number" || (typeof a === "string" && /^\d+$/.test(a))) return { host: typeof args[1] === "string" ? args[1] : "localhost", port: a };
  return { path: a };
}

function isLocal(t) {
  // No host means an IPC path or the default (localhost). Note https options
  // carry a URL "path" too, so path alone says nothing.
  return LOCAL.has(t.host) || String(t.host).endsWith(".localhost");
}

function refuse(socket, t) {
  const line = `${t.host}:${t.port}`;
  if (logFile) {
    try {
      fs.appendFileSync(logFile, line + "\n");
    } catch {
      // logging must never let the connection through
    }
  }
  process.nextTick(() => socket.destroy(new Error(`[e2e] blocked outbound connection to ${line}`)));
  return socket;
}

// Plain TCP (and undici/fetch).
net.Socket.prototype.connect = function (...args) {
  const t = target(args);
  if (!isLocal(t)) return refuse(this, t);
  return originalConnect.apply(this, args);
};

// https / TLS (the https module, and so the Stripe SDK, goes through here).
const originalTlsConnect = tls.connect;
tls.connect = function (...args) {
  const t = target(args);
  // tls.connect(options) over an already-connected socket was checked when that socket connected.
  const opts = args.find((a) => a && typeof a === "object" && !Array.isArray(a));
  if (!(opts && opts.socket) && !isLocal(t)) return refuse(new tls.TLSSocket(new net.Socket()), t);
  return originalTlsConnect.apply(this, args);
};
