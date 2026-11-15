import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  loadDotEnv,
  generateIntegritySignature,
  verifyWebhookChecksum,
  computeWebhookChecksum,
  signStoreCallbackPayload,
  type WompiWebhookEvent,
} from "./crypto.ts";
import { GatewayDatabase } from "./db.ts";
import { loadWompiConfig, WompiApiClient } from "./wompi.ts";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(path.join(PROJECT_ROOT, ".env"));
const config = loadWompiConfig();
const resolvedDbPath = path.isAbsolute(config.sqliteDbPath)
  ? config.sqliteDbPath
  : path.resolve(PROJECT_ROOT, config.sqliteDbPath);
const db = new GatewayDatabase(resolvedDbPath);
const wompi = new WompiApiClient(config);

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function sendHtml(res: http.ServerResponse, statusCode: number, html: string): void {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function applyCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const origin = req.headers.origin || "*";
  const allowAll = config.allowedCorsOrigins.includes("*");
  if (allowAll || (req.headers.origin && config.allowedCorsOrigins.includes(req.headers.origin))) {
    res.setHeader("Access-Control-Allow-Origin", allowAll ? "*" : origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Gateway-Key, X-Event-Checksum");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

function checkInternalAuth(req: http.IncomingMessage): boolean {
  if (!config.internalApiKey || config.internalApiKey.startsWith("cambiar_por_")) {
    return true; // Modo desarrollo local mientras no se fije INTERNAL_GATEWAY_API_KEY
  }
  const provided = req.headers["x-gateway-key"];
  return typeof provided === "string" && provided === config.internalApiKey;
}

async function readRequestBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isSecretConfigured(val: string): boolean {
  return Boolean(val && !val.includes("REEMPLAZAR"));
}

async function notifyExternalStore(
  callbackUrl: string,
  payloadObj: Record<string, unknown>
): Promise<void> {
  try {
    const rawJson = JSON.stringify(payloadObj);
    const sig = signStoreCallbackPayload(rawJson, config.internalApiKey || "dev-secret");
    await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Signature": sig,
      },
      body: rawJson,
    });
  } catch (err) {
    console.error(`[StoreCallback] Error notificando a ${callbackUrl}:`, err);
  }
}

function escapeHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderConsoleHtml(): string {
  const integrityReady = isSecretConfigured(config.integritySecret);
  const publicReady = isSecretConfigured(config.publicKey);
  const isProd = config.env === "production";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Huston Assets S.A. — Pasarela Wompi Panamá</title>
  <script src="${config.widgetScriptUrl}"></script>
  <style>
    :root {
      --bg-base: #eef7ff;
      --bg-card: #ffffff;
      --bg-subtle: #f4f9ff;
      --sky-50: #f0f9ff;
      --sky-100: #e0f2fe;
      --sky-200: #bae6fd;
      --sky-400: #38bdf8;
      --sky-500: #0ea5e9;
      --sky-600: #0284c7;
      --sky-700: #0369a1;
      --cyan-500: #06b6d4;
      --indigo-600: #4f46e5;
      --indigo-700: #4338ca;
      --emerald-600: #059669;
      --text-main: #0f172a;
      --text-secondary: #334155;
      --text-muted: #64748b;
      --border-soft: #cfe8fc;
      --shadow-card: 0 12px 32px -10px rgba(2, 132, 199, 0.13), 0 4px 12px -4px rgba(15, 23, 42, 0.04);
      --radius-lg: 18px;
      --radius-md: 12px;
    }

    * { box-sizing: border-box; font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text-main);
      background-color: var(--bg-base);
      background-image:
        radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.22) 0px, transparent 52%),
        radial-gradient(at 100% 0%, rgba(6, 182, 212, 0.18) 0px, transparent 48%),
        radial-gradient(at 50% 100%, rgba(79, 70, 229, 0.08) 0px, transparent 55%);
      padding: 28px 20px 48px;
    }

    .container { max-width: 1140px; margin: 0 auto; }

    /* Hero Principal Destacado */
    .hero {
      position: relative;
      overflow: hidden;
      background: linear-gradient(130deg, #0369a1 0%, #0284c7 48%, #06b6d4 100%);
      border-radius: 22px;
      padding: 28px 32px;
      color: #ffffff;
      box-shadow: 0 18px 40px -12px rgba(2, 132, 199, 0.38);
      margin-bottom: 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .hero::before {
      content: "";
      position: absolute;
      right: -60px;
      top: -80px;
      width: 280px;
      height: 280px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%);
      pointer-events: none;
    }
    .hero-brand { display: flex; align-items: center; gap: 16px; position: relative; z-index: 1; }
    .hero-logo {
      width: 54px;
      height: 54px;
      border-radius: 15px;
      background: rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.32);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 8px 20px rgba(3, 105, 161, 0.25);
    }
    .hero h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
    .hero p { margin: 5px 0 0; font-size: 13.5px; color: #e0f2fe; font-weight: 500; }

    .hero-badges { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; position: relative; z-index: 1; }
    .pill-methods {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 13px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.16);
      border: 1px solid rgba(255, 255, 255, 0.28);
      color: #ffffff;
    }
    .badge-env {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: ${isProd ? "#ffffff" : "#fef9c3"};
      color: ${isProd ? "#be123c" : "#854d0e"};
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    }
    .dot-pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${isProd ? "#e11d48" : "#ca8a04"};
      box-shadow: 0 0 0 3px ${isProd ? "rgba(225,29,72,0.22)" : "rgba(202,138,4,0.25)"};
    }

    /* Franja de Indicadores Rápidos */
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 22px;
    }
    @media (max-width: 860px) { .kpi-strip { grid-template-columns: 1fr; } }
    .kpi-card {
      background: linear-gradient(180deg, #ffffff 0%, #f8fcff 100%);
      border: 1px solid var(--border-soft);
      border-radius: 15px;
      padding: 15px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      box-shadow: 0 6px 18px -8px rgba(2, 132, 199, 0.12);
    }
    .kpi-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .kpi-icon.sky { background: var(--sky-100); color: var(--sky-600); }
    .kpi-icon.cyan { background: #cffafe; color: #0891b2; }
    .kpi-icon.emerald { background: #d1fae5; color: var(--emerald-600); }
    .kpi-label { font-size: 12px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
    .kpi-value { font-size: 18px; font-weight: 800; color: var(--text-main); margin-top: 2px; }

    /* Alerta configuracion */
    .warn {
      background: #fffbeb;
      border: 1px solid #fcd34d;
      color: #92400e;
      padding: 14px 18px;
      border-radius: var(--radius-md);
      margin-bottom: 20px;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* Layout Principal */
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      gap: 22px;
      align-items: start;
    }
    .grid > * { min-width: 0; }
    @media (max-width: 900px) { .grid { grid-template-columns: minmax(0, 1fr); } }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-lg);
      padding: 24px;
      box-shadow: var(--shadow-card);
      min-width: 0;
      max-width: 100%;
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 18px;
      padding-bottom: 14px;
      border-bottom: 1px solid #e2f1fd;
    }
    .section-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--sky-100), #cffafe);
      color: var(--sky-700);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    h2 { margin: 0; font-size: 17px; font-weight: 700; color: var(--text-main); }
    .card-sub { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }

    /* Formulario */
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 540px) { .form-row { grid-template-columns: 1fr; } }
    label {
      display: block;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 5px;
      margin-top: 12px;
    }
    input {
      width: 100%;
      padding: 10.5px 13px;
      border-radius: 10px;
      border: 1.5px solid #cbd5e1;
      background: var(--bg-subtle);
      color: var(--text-main);
      font-size: 14px;
      transition: all 0.18s ease;
    }
    input:focus {
      outline: none;
      background: #ffffff;
      border-color: var(--sky-500);
      box-shadow: 0 0 0 3.5px rgba(14, 165, 233, 0.18);
    }

    /* Botones con Iconos SVG */
    .btn-group { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
    .btn-toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      padding: 12px 18px;
      border: none;
      border-radius: 11px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.18s ease, background 0.18s ease;
      width: 100%;
    }
    button svg { width: 18px; height: 18px; flex-shrink: 0; transition: transform 0.18s ease; }
    button:hover { transform: translateY(-1.5px); }
    button:active { transform: translateY(0); }

    .btn-primary {
      background: linear-gradient(135deg, #0284c7 0%, #0ea5e9 55%, #06b6d4 100%);
      color: #ffffff;
      box-shadow: 0 8px 20px -6px rgba(2, 132, 199, 0.55);
    }
    .btn-primary:hover {
      box-shadow: 0 12px 24px -6px rgba(2, 132, 199, 0.7);
    }
    .btn-primary:hover svg { transform: scale(1.08); }

    .btn-indigo {
      background: linear-gradient(135deg, #4f46e5 0%, #0284c7 100%);
      color: #ffffff;
      box-shadow: 0 8px 18px -6px rgba(79, 70, 229, 0.42);
    }
    .btn-indigo:hover svg { transform: translate(2px, -2px); }

    .btn-tonal {
      background: var(--sky-100);
      color: var(--sky-700);
      border: 1px solid var(--sky-200);
      width: auto;
      flex: 1 1 200px;
      padding: 10.5px 16px;
      font-size: 13.5px;
    }
    .btn-tonal:hover { background: #bae6fd; color: #075985; }

    .btn-emerald {
      background: linear-gradient(135deg, #059669 0%, #10b981 100%);
      color: #ffffff;
      width: auto;
      flex: 1 1 180px;
      padding: 10.5px 16px;
      font-size: 13.5px;
      box-shadow: 0 6px 16px -6px rgba(5, 150, 105, 0.45);
    }

    .btn-ghost {
      background: #f8fafc;
      color: var(--text-secondary);
      border: 1px solid #cbd5e1;
      width: auto;
      padding: 10px 16px;
      font-size: 13.5px;
    }
    .btn-ghost:hover { background: var(--sky-50); border-color: var(--sky-400); color: var(--sky-700); }

    .btn-mini {
      width: auto;
      padding: 6px 10px;
      font-size: 12px;
      border-radius: 8px;
      background: var(--sky-50);
      color: var(--sky-700);
      border: 1px solid var(--sky-200);
      gap: 5px;
    }
    .btn-mini svg { width: 14px; height: 14px; }
    .btn-mini:hover { background: var(--sky-100); }

    @keyframes spinOnce { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin svg { animation: spinOnce 0.55s ease; }

    /* Visor JSON */
    pre {
      background: #0f172a;
      color: #e0f2fe;
      padding: 15px;
      border-radius: 12px;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      font-size: 12.5px;
      line-height: 1.55;
      border: 1px solid #1e3a5f;
      min-height: 235px;
      max-height: 310px;
      margin: 0;
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    /* Tabla de Ordenes */
    .table-wrap { overflow-x: auto; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th {
      text-align: left;
      padding: 11px 12px;
      background: var(--sky-50);
      color: var(--sky-700);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1.5px solid var(--sky-200);
    }
    th:first-child { border-top-left-radius: 10px; }
    th:last-child { border-top-right-radius: 10px; }
    td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
      color: var(--text-secondary);
      vertical-align: middle;
    }
    tbody tr:hover { background: #f8fcff; }
    code.ref-code {
      background: var(--sky-50);
      color: var(--sky-700);
      border: 1px solid var(--sky-200);
      padding: 3px 7px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }

    /* Badges de Estado en Tabla */
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .status-approved { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .status-pending { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .status-declined { background: #ffe4e6; color: #9f1239; border: 1px solid #fda4af; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Hero Principal Azul Claro / Océano -->
    <header class="hero">
      <div class="hero-brand">
        <div class="hero-logo" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="3"></rect>
            <line x1="2" y1="10" x2="22" y2="10"></line>
            <path d="M7 15h3"></path>
            <path d="M16 14l1.5 1.5L20 13"></path>
          </svg>
        </div>
        <div>
          <h1>HUSTON ASSETS S.A.</h1>
          <p>Centro de Control • Pasarela de Pagos Wompi Panamá (Checkout, Webhooks y API Directa)</p>
        </div>
      </div>

      <div class="hero-badges">
        <span class="pill-methods">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          USD • Visa / MC / Clave
        </span>
        <span class="badge-env">
          <span class="dot-pulse"></span>
          Ambiente: ${escapeHtml(config.env)}
        </span>
      </div>
    </header>

    <!-- Indicadores Rápidos -->
    <section class="kpi-strip">
      <div class="kpi-card">
        <div class="kpi-icon sky">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
          </svg>
        </div>
        <div>
          <div class="kpi-label">Conexión Wompi Panamá</div>
          <div class="kpi-value" id="kpiApiStatus">${integrityReady && publicReady ? "Llaves Activas" : "Pendiente .env"}</div>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon cyan">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
        </div>
        <div>
          <div class="kpi-label">Órdenes Registradas</div>
          <div class="kpi-value" id="kpiOrderCount">0 órdenes</div>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon emerald">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        </div>
        <div>
          <div class="kpi-label">Volumen Aprobado</div>
          <div class="kpi-value" id="kpiApprovedSum">$0.00 USD</div>
        </div>
      </div>
    </section>

    ${!integrityReady || !publicReady ? `
    <div class="warn">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <div><strong>Configuración pendiente en <code>.env</code>:</strong> Configura tus llaves del ambiente <strong>${escapeHtml(config.env)}</strong> para habilitar firmas reales con Wompi Panamá.</div>
    </div>` : ""}

    <div class="grid">
      <!-- Tarjeta 1: Creación y Firma de Orden -->
      <div class="card">
        <div class="card-header">
          <div class="section-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
            </svg>
          </div>
          <div>
            <h2>1. Crear Orden Firmada y Abrir Checkout</h2>
            <div class="card-sub">Firma criptográfica SHA-256 generada en servidor</div>
          </div>
        </div>

        <div class="form-row">
          <div>
            <label for="extId">ID Orden / Factura</label>
            <input id="extId" value="FACT-1001" placeholder="Ej. FACT-1001" />
          </div>
          <div>
            <label for="amount">Monto a Cobrar (USD)</label>
            <input id="amount" type="number" step="0.01" min="0.50" value="15.00" />
          </div>
        </div>

        <label for="email">Correo Electrónico del Cliente</label>
        <input id="email" type="email" value="cliente@ejemplo.com" placeholder="cliente@dominio.com" />

        <label for="desc">Concepto / Descripción del Pago</label>
        <input id="desc" value="Pago de servicio Huston Assets S.A." />

        <div class="btn-group">
          <button class="btn-primary" onclick="crearYAbrirWidget()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2.5"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
              <path d="M16 14.5l1.5 1.5 3-3"></path>
            </svg>
            Firmar Orden y Abrir Widget Wompi
          </button>

          <button class="btn-indigo" onclick="crearYRedirigirWebCheckout()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            Firmar y Abrir Web Checkout (Nueva Pestaña)
          </button>
        </div>
      </div>

      <!-- Tarjeta 2: Diagnóstico API y Respuesta -->
      <div class="card">
        <div class="card-header">
          <div class="section-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
          </div>
          <div>
            <h2>2. Inspector API & Eventos Webhook</h2>
            <div class="card-sub">Monitoreo de firmas, tokens reglamentarios y callbacks</div>
          </div>
        </div>

        <pre id="out">Listo para firmar una orden o verificar conexión con Wompi Panamá...</pre>

        <div class="btn-toolbar">
          <button class="btn-tonal" onclick="probarConexionWompi()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            Probar API Wompi en Vivo
          </button>

          ${!isProd ? `
          <button class="btn-emerald" onclick="simularWebhookLocal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            Simular Webhook APPROVED
          </button>` : `
          <button class="btn-ghost" onclick="copiarSalidaJson()" title="Copiar respuesta JSON">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copiar JSON
          </button>`}
        </div>
      </div>
    </div>

    <!-- Tarjeta 3: Historial Transaccional SQLite -->
    <div class="card" style="margin-top:22px;">
      <div class="card-header" style="justify-content:space-between;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="section-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
            </svg>
          </div>
          <div>
            <h2>3. Órdenes Registradas en Base de Datos</h2>
            <div class="card-sub">Persistencia local SQLite sincronizable con Wompi API</div>
          </div>
        </div>

        <button id="btnRefresh" class="btn-ghost" onclick="cargarOrdenes(true)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Actualizar Lista
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Referencia</th>
              <th>Orden Tienda</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>ID Wompi</th>
              <th>Actualizado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody id="ordersBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    let ultimaReferencia = null;

    function renderBadgeEstado(status) {
      const st = String(status || 'PENDING').toUpperCase();
      if (st === 'APPROVED') {
        return '<span class="status-pill status-approved">✓ APPROVED</span>';
      }
      if (st === 'DECLINED' || st === 'ERROR' || st === 'VOIDED') {
        return '<span class="status-pill status-declined">✕ ' + st + '</span>';
      }
      return '<span class="status-pill status-pending">◷ ' + st + '</span>';
    }

    async function crearOrden() {
      const monto = Number(document.getElementById('amount').value);
      const resp = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalOrderId: document.getElementById('extId').value,
          amountInCents: Math.round(monto * 100),
          currency: 'USD',
          customerEmail: document.getElementById('email').value,
          description: document.getElementById('desc').value
        })
      });
      const data = await resp.json();
      document.getElementById('out').textContent = JSON.stringify(data, null, 2);
      if (!resp.ok) throw new Error(data.error || 'Error creando orden');
      ultimaReferencia = data.order.reference;
      await cargarOrdenes();
      return data;
    }

    function esRedirectPublicoHttps(urlStr) {
      if (!urlStr) return false;
      try {
        const u = new URL(urlStr);
        const host = u.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
          return false;
        }
        return u.protocol === 'https:';
      } catch {
        return false;
      }
    }

    async function crearYAbrirWidget() {
      try {
        const data = await crearOrden();
        if (typeof WidgetCheckout === 'undefined') {
          alert('El navegador no pudo cargar widget.js desde checkout.wompi.pa (verifica si CloudFront bloquea tu region sin VPN).');
          return;
        }
        const widgetCfg = {
          currency: data.checkout.currency,
          amountInCents: data.checkout.amountInCents,
          reference: data.checkout.reference,
          publicKey: data.checkout.publicKey,
          signature: { integrity: data.checkout.integritySignature }
        };
        if (esRedirectPublicoHttps(data.checkout.redirectUrl)) {
          widgetCfg.redirectUrl = data.checkout.redirectUrl;
        }
        const checkout = new WidgetCheckout(widgetCfg);
        checkout.open(function (result) {
          document.getElementById('out').textContent = JSON.stringify(result, null, 2);
          cargarOrdenes();
        });
      } catch (e) {
        alert(e.message);
      }
    }

    async function crearYRedirigirWebCheckout() {
      try {
        const data = await crearOrden();
        const url = new URL(data.checkout.webCheckoutUrl);
        url.searchParams.set('public-key', data.checkout.publicKey);
        url.searchParams.set('currency', data.checkout.currency);
        url.searchParams.set('amount-in-cents', String(data.checkout.amountInCents));
        url.searchParams.set('reference', data.checkout.reference);
        url.searchParams.set('signature:integrity', data.checkout.integritySignature);
        if (esRedirectPublicoHttps(data.checkout.redirectUrl)) {
          url.searchParams.set('redirect-url', data.checkout.redirectUrl);
        }
        window.open(url.toString(), '_blank');
      } catch (e) {
        alert(e.message);
      }
    }

    async function probarConexionWompi() {
      document.getElementById('out').textContent = 'Consultando api.wompi.pa/v1/merchants/...';
      try {
        const resp = await fetch('/api/wompi/acceptance-token');
        const data = await resp.json();
        document.getElementById('out').textContent = JSON.stringify(data, null, 2);
        if (resp.ok && data.merchantName) {
          document.getElementById('kpiApiStatus').textContent = 'Online ✓';
        }
      } catch (e) {
        document.getElementById('out').textContent = 'Error consultando API: ' + e.message;
      }
    }

    async function copiarSalidaJson() {
      const txt = document.getElementById('out').textContent || '';
      await navigator.clipboard.writeText(txt);
    }

    async function sincronizarOrden(ref) {
      const resp = await fetch('/api/orders/' + encodeURIComponent(ref) + '?sync=1');
      const data = await resp.json();
      document.getElementById('out').textContent = JSON.stringify(data, null, 2);
      await cargarOrdenes();
    }

    async function simularWebhookLocal() {
      if (!ultimaReferencia) {
        alert('Primero crea una orden en el paso 1.');
        return;
      }
      const resp = await fetch('/api/dev/simulate-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: ultimaReferencia, status: 'APPROVED' })
      });
      const data = await resp.json();
      document.getElementById('out').textContent = JSON.stringify(data, null, 2);
      await cargarOrdenes();
    }

    async function cargarOrdenes(animar = false) {
      if (animar) {
        const btn = document.getElementById('btnRefresh');
        btn.classList.remove('spin');
        void btn.offsetWidth;
        btn.classList.add('spin');
      }
      const resp = await fetch('/api/orders');
      const data = await resp.json();
      const orders = data.orders || [];

      document.getElementById('kpiOrderCount').textContent =
        orders.length + (orders.length === 1 ? ' orden' : ' órdenes');

      const approvedCents = orders
        .filter(o => String(o.status).toUpperCase() === 'APPROVED')
        .reduce((acc, o) => acc + Number(o.amount_in_cents || 0), 0);
      document.getElementById('kpiApprovedSum').textContent =
        '$' + (approvedCents / 100).toFixed(2) + ' USD';

      const tbody = document.getElementById('ordersBody');
      if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b;padding:22px;">Aún no hay órdenes registradas. Crea la primera orden arriba.</td></tr>';
        return;
      }
      tbody.innerHTML = orders.map(o => \`
        <tr>
          <td><code class="ref-code">\${o.reference}</code></td>
          <td>\${o.external_order_id || '-'}</td>
          <td><strong>$\${(o.amount_in_cents / 100).toFixed(2)} \${o.currency}</strong></td>
          <td>\${renderBadgeEstado(o.status)}</td>
          <td>\${o.wompi_transaction_id || '-'}</td>
          <td style="font-size:12px;color:#64748b;">\${o.updated_at}</td>
          <td>
            <button class="btn-mini" onclick="sincronizarOrden('\${o.reference}')" title="Consultar estado real en Wompi">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              Sync
            </button>
          </td>
        </tr>
      \`).join('');
    }
    cargarOrdenes();
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    if (applyCors(req, res)) return;

    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = reqUrl.pathname;

    // 1. Consola Web Interactiva
    if (req.method === "GET" && pathname === "/") {
      return sendHtml(res, 200, renderConsoleHtml());
    }

    // 2. Pagina de retorno tras el pago (redirectUrl)
    if (req.method === "GET" && pathname === "/checkout/result") {
      const txId = reqUrl.searchParams.get("id");
      let txInfo: Record<string, any> | null = null;
      if (txId) {
        try {
          txInfo = await wompi.getTransactionById(txId);
          if (txInfo?.reference && txInfo?.status) {
            db.updateOrderFromTransaction({
              reference: txInfo.reference,
              status: txInfo.status,
              wompiTransactionId: String(txInfo.id),
              paymentMethodType: txInfo.payment_method_type,
            });
          }
        } catch (err) {
          console.warn("[RedirectResult] No se pudo sincronizar tx:", err);
        }
      }
      const statusUpper = String(txInfo?.status || "PENDING").toUpperCase();
      const statusColor =
        statusUpper === "APPROVED" ? "#059669" : statusUpper === "DECLINED" ? "#e11d48" : "#d97706";
      const statusBg =
        statusUpper === "APPROVED" ? "#d1fae5" : statusUpper === "DECLINED" ? "#ffe4e6" : "#fef3c7";

      return sendHtml(
        res,
        200,
        `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comprobante de Transacción — Huston Assets S.A.</title></head>
        <body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f1f5f9;color:#0f172a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;max-width:480px;width:100%;padding:32px;box-shadow:0 16px 36px -12px rgba(15,23,42,0.12);text-align:center;">
            <div style="width:56px;height:56px;border-radius:50%;background:${statusBg};color:${statusColor};display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h1 style="margin:0 0 6px;font-size:21px;">Comprobante de Transacción</h1>
            <p style="margin:0 0 22px;color:#64748b;font-size:13.5px;">HUSTON ASSETS S.A. • Pasarela Wompi Panamá</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:left;font-size:14px;line-height:1.9;margin-bottom:24px;">
              <div><span style="color:#64748b;">ID Transacción:</span> <strong style="float:right;">${escapeHtml(txId || "No proporcionado")}</strong></div>
              <div><span style="color:#64748b;">Referencia:</span> <strong style="float:right;">${escapeHtml(txInfo?.reference || "-")}</strong></div>
              <div><span style="color:#64748b;">Estado:</span> <strong style="float:right;color:${statusColor};">${escapeHtml(txInfo?.status || "En verificación por Webhook")}</strong></div>
            </div>
            <a href="/" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;background:#0284c7;color:#ffffff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:11px;box-shadow:0 8px 18px -6px rgba(2,132,199,0.45);">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Volver al Centro de Control
            </a>
          </div>
        </body></html>`
      );
    }

    // 3. Healthcheck y diagnostico de configuracion
    if (req.method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        merchant: "HUSTON ASSETS S.A.",
        environment: config.env,
        apiBaseUrl: config.apiBaseUrl,
        keysConfigured: {
          publicKey: isSecretConfigured(config.publicKey),
          privateKey: isSecretConfigured(config.privateKey),
          integritySecret: isSecretConfigured(config.integritySecret),
          eventsSecret: isSecretConfigured(config.eventsSecret),
        },
      });
    }

    // 4. Crear orden firmada (Llamado desde la web/tienda existente o frontend)
    if (req.method === "POST" && pathname === "/api/orders") {
      if (!checkInternalAuth(req)) {
        return sendJson(res, 401, { error: "No autorizado (X-Gateway-Key invalida)." });
      }
      const body = JSON.parse((await readRequestBody(req)) || "{}");
      const amountInCents = Number(body.amountInCents);
      const currency = String(body.currency || "USD").toUpperCase();

      if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
        return sendJson(res, 400, {
          error: "amountInCents es obligatorio y debe ser entero positivo (ej: $25.00 = 2500).",
        });
      }

      const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
      const reference = body.reference
        ? String(body.reference)
        : `HA-${Date.now()}-${suffix}`;
      const redirectUrl = body.redirectUrl ? String(body.redirectUrl) : config.defaultRedirectUrl;

      const secretForSigning = isSecretConfigured(config.integritySecret)
        ? config.integritySecret
        : "dev_unconfigured_integrity_secret";

      const integritySignature = generateIntegritySignature({
        reference,
        amountInCents,
        currency,
        integritySecret: secretForSigning,
        expirationTime: body.expirationTime ? String(body.expirationTime) : undefined,
      });

      const order = db.createOrder({
        reference,
        externalOrderId: body.externalOrderId ? String(body.externalOrderId) : undefined,
        amountInCents,
        currency,
        customerEmail: body.customerEmail ? String(body.customerEmail) : undefined,
        customerName: body.customerName ? String(body.customerName) : undefined,
        description: body.description ? String(body.description) : undefined,
        redirectUrl,
        callbackNotifyUrl: body.callbackNotifyUrl ? String(body.callbackNotifyUrl) : undefined,
        metadata: typeof body.metadata === "object" ? body.metadata : undefined,
        environment: config.env,
      });

      return sendJson(res, 201, {
        order,
        checkout: {
          publicKey: config.publicKey,
          reference,
          amountInCents,
          currency,
          integritySignature,
          redirectUrl,
          widgetScriptUrl: config.widgetScriptUrl,
          webCheckoutUrl: config.webCheckoutUrl,
          warning: isSecretConfigured(config.integritySecret)
            ? undefined
            : "Firma generada con secreto temporal de desarrollo. Configura .env antes de conectar con Wompi real.",
        },
      });
    }

    // 5. Listar ordenes recientes
    if (req.method === "GET" && pathname === "/api/orders") {
      if (!checkInternalAuth(req)) {
        return sendJson(res, 401, { error: "No autorizado." });
      }
      return sendJson(res, 200, { orders: db.listOrders(50) });
    }

    // 6. Consultar una orden por referencia (opcional ?sync=1 consulta Wompi API en vivo)
    if (req.method === "GET" && pathname.startsWith("/api/orders/")) {
      const reference = decodeURIComponent(pathname.slice("/api/orders/".length));
      let order = db.getOrderByReference(reference);
      if (!order) {
        return sendJson(res, 404, { error: `Orden '${reference}' no encontrada.` });
      }

      if (reqUrl.searchParams.get("sync") === "1" && isSecretConfigured(config.privateKey)) {
        const txs = await wompi.getTransactionsByReference(reference);
        if (txs.length > 0) {
          const latest = txs[0];
          order =
            db.updateOrderFromTransaction({
              reference,
              status: latest.status,
              wompiTransactionId: String(latest.id),
              paymentMethodType: latest.payment_method_type,
            }) || order;
        }
      }
      return sendJson(res, 200, { order });
    }

    // 7. API Directa (Opcion 3): Obtener token de aceptacion de terminos de Wompi
    if (req.method === "GET" && pathname === "/api/wompi/acceptance-token") {
      const tokens = await wompi.getMerchantAcceptanceTokens();
      return sendJson(res, 200, tokens);
    }

    // 8. API Directa (Opcion 3): Crear Link de Pago dinamico
    if (req.method === "POST" && pathname === "/api/wompi/payment-links") {
      if (!checkInternalAuth(req)) {
        return sendJson(res, 401, { error: "No autorizado." });
      }
      const body = JSON.parse((await readRequestBody(req)) || "{}");
      const link = await wompi.createPaymentLink({
        name: String(body.name || "Pago Huston Assets S.A."),
        description: String(body.description || "Orden de pago"),
        singleUse: body.singleUse !== false,
        amountInCents: body.amountInCents ? Number(body.amountInCents) : undefined,
        currency: String(body.currency || "USD"),
        redirectUrl: body.redirectUrl ? String(body.redirectUrl) : config.defaultRedirectUrl,
      });
      return sendJson(res, 201, { paymentLink: link });
    }

    // 9. API Directa (Opcion 3): Cobro directo con fuente tokenizada / tarjeta tokenizada
    if (req.method === "POST" && pathname === "/api/wompi/direct-charge") {
      if (!checkInternalAuth(req)) {
        return sendJson(res, 401, { error: "No autorizado." });
      }
      const body = JSON.parse((await readRequestBody(req)) || "{}");
      const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
      const reference = body.reference ? String(body.reference) : `HA-DIR-${Date.now()}-${suffix}`;
      const amountInCents = Number(body.amountInCents);
      const currency = String(body.currency || "USD");

      db.createOrder({
        reference,
        externalOrderId: body.externalOrderId ? String(body.externalOrderId) : undefined,
        amountInCents,
        currency,
        customerEmail: String(body.customerEmail || ""),
        description: body.description ? String(body.description) : "Cobro API Directa",
        callbackNotifyUrl: body.callbackNotifyUrl ? String(body.callbackNotifyUrl) : undefined,
        environment: config.env,
      });

      const tx = await wompi.createDirectTransaction({
        amountInCents,
        currency,
        customerEmail: String(body.customerEmail),
        reference,
        paymentMethod: body.paymentMethod,
        paymentSourceId: body.paymentSourceId !== undefined ? Number(body.paymentSourceId) : undefined,
        acceptanceToken: body.acceptanceToken,
        redirectUrl: body.redirectUrl ? String(body.redirectUrl) : config.defaultRedirectUrl,
        customerData: body.customerData,
      });

      const updated = db.updateOrderFromTransaction({
        reference,
        status: tx.status || "PENDING",
        wompiTransactionId: String(tx.id),
        paymentMethodType: tx.payment_method_type,
      });

      return sendJson(res, 201, { order: updated, wompiTransaction: tx });
    }

    // 10. Receptor Oficial de Webhooks Wompi Panama ("URL de Eventos")
    if (req.method === "POST" && pathname === "/api/webhooks/wompi") {
      const rawBody = await readRequestBody(req);
      const eventBody = JSON.parse(rawBody || "{}") as WompiWebhookEvent;
      const headerChecksum = req.headers["x-event-checksum"] as string | undefined;

      const secret = isSecretConfigured(config.eventsSecret)
        ? config.eventsSecret
        : "dev_unconfigured_events_secret";

      const isValid = verifyWebhookChecksum(eventBody, headerChecksum, secret);
      const tx = (eventBody?.data as Record<string, any>)?.transaction;

      db.logWebhookEvent({
        eventType: eventBody?.event || "unknown",
        wompiTxId: tx?.id ? String(tx.id) : undefined,
        reference: tx?.reference ? String(tx.reference) : undefined,
        status: tx?.status ? String(tx.status) : undefined,
        checksumValid: isValid,
        rawPayload: rawBody,
      });

      if (!isValid) {
        return sendJson(res, 401, { error: "Checksum de evento Wompi invalido." });
      }

      if (eventBody.event === "transaction.updated" && tx?.reference && tx?.status) {
        const updatedOrder = db.updateOrderFromTransaction({
          reference: String(tx.reference),
          status: String(tx.status),
          wompiTransactionId: tx.id ? String(tx.id) : undefined,
          paymentMethodType: tx.payment_method_type ? String(tx.payment_method_type) : undefined,
        });

        // Si la tienda/web principal registro un callbackNotifyUrl, reenviar confirmacion firmada
        if (updatedOrder?.callback_notify_url) {
          void notifyExternalStore(updatedOrder.callback_notify_url, {
            event: "order.payment_updated",
            reference: updatedOrder.reference,
            externalOrderId: updatedOrder.external_order_id,
            status: updatedOrder.status,
            amountInCents: updatedOrder.amount_in_cents,
            currency: updatedOrder.currency,
            wompiTransactionId: updatedOrder.wompi_transaction_id,
          });
        }
      }

      return sendJson(res, 200, { received: true });
    }

    // 11. Endpoint auxiliar solo en Sandbox para probar el flujo completo de Webhook localmente
    if (req.method === "POST" && pathname === "/api/dev/simulate-webhook" && config.env !== "production") {
      const body = JSON.parse((await readRequestBody(req)) || "{}");
      const reference = String(body.reference || "");
      const status = String(body.status || "APPROVED");
      const order = db.getOrderByReference(reference);
      if (!order) return sendJson(res, 404, { error: "Orden no existe" });

      const timestamp = Math.floor(Date.now() / 1000);
      const fakeEvent: WompiWebhookEvent = {
        event: "transaction.updated",
        data: {
          transaction: {
            id: `sim_tx_${Date.now()}`,
            amount_in_cents: order.amount_in_cents,
            reference: order.reference,
            currency: order.currency,
            payment_method_type: "CARD",
            status,
          },
        },
        environment: "test",
        signature: {
          properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
          checksum: "",
          timestamp,
        },
        timestamp,
      };

      const secret = isSecretConfigured(config.eventsSecret)
        ? config.eventsSecret
        : "dev_unconfigured_events_secret";
      fakeEvent.signature.checksum = computeWebhookChecksum(fakeEvent, secret);

      const whResp = await fetch(`http://127.0.0.1:${config.port}/api/webhooks/wompi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Event-Checksum": fakeEvent.signature.checksum,
        },
        body: JSON.stringify(fakeEvent),
      });
      return sendJson(res, 200, {
        simulatedEvent: fakeEvent,
        webhookResponse: await whResp.json(),
        updatedOrder: db.getOrderByReference(reference),
      });
    }

    return sendJson(res, 404, { error: "Ruta no encontrada." });
  } catch (err: any) {
    console.error("[ServerError]", err);
    return sendJson(res, 500, { error: err?.message || "Error interno del servidor." });
  }
});

server.listen(config.port, () => {
  console.log(`================================================================`);
  console.log(` Pasarela Wompi Panama (HUSTON ASSETS S.A.) activa`);
  console.log(` Ambiente       : ${config.env.toUpperCase()}`);
  console.log(` Consola Local  : http://localhost:${config.port}/`);
  console.log(` Healthcheck    : http://localhost:${config.port}/api/health`);
  console.log(` Webhook URL    : http://localhost:${config.port}/api/webhooks/wompi`);
  console.log(`================================================================`);
});
