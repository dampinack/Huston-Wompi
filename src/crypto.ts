import crypto from "node:crypto";
import fs from "node:fs";

/**
 * Carga variables desde un archivo .env sin dependencias externas.
 */
export function loadDotEnv(envPath = ".env"): void {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export interface IntegritySignatureParams {
  reference: string;
  amountInCents: number;
  currency: string;
  integritySecret: string;
  expirationTime?: string;
}

/**
 * Genera el hash SHA-256 de integridad exigido por Wompi Panama:
 * SHA256(reference + amountInCents + currency + [expirationTime] + integritySecret)
 */
export function generateIntegritySignature(params: IntegritySignatureParams): string {
  const { reference, amountInCents, currency, integritySecret, expirationTime } = params;
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw new Error("amountInCents debe ser un entero positivo (ej: $10.50 USD = 1050).");
  }
  const concatenated = `${reference}${amountInCents}${currency}${expirationTime ?? ""}${integritySecret}`;
  return crypto.createHash("sha256").update(concatenated, "utf8").digest("hex");
}

export interface WompiWebhookEvent {
  event: string;
  data: Record<string, unknown>;
  environment?: string;
  signature: {
    properties: string[];
    checksum: string;
    timestamp?: number;
  };
  timestamp?: number;
  sent_at?: string;
}

function getNestedProperty(obj: Record<string, unknown>, dotPath: string): unknown {
  const cleanPath = dotPath.startsWith("data.") ? dotPath.slice(5) : dotPath;
  return cleanPath.split(".").reduce<unknown>((acc, part) => {
    if (acc !== null && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

/**
 * Calcula el checksum SHA-256 oficial de un evento Webhook de Wompi Panama.
 */
export function computeWebhookChecksum(eventBody: WompiWebhookEvent, eventsSecret: string): string {
  const properties = eventBody?.signature?.properties;
  const timestamp = eventBody?.signature?.timestamp ?? eventBody?.timestamp;

  if (!Array.isArray(properties) || timestamp === undefined) {
    throw new Error("Estructura de firma de evento Wompi incompleta.");
  }

  let concatenated = "";
  for (const prop of properties) {
    const val = getNestedProperty(eventBody.data ?? {}, prop);
    concatenated += val !== undefined && val !== null ? String(val) : "";
  }
  concatenated += String(timestamp);
  concatenated += eventsSecret;

  return crypto.createHash("sha256").update(concatenated, "utf8").digest("hex");
}

/**
 * Verifica de forma segura en tiempo constante (timing-safe) la autenticidad de un Webhook de Wompi.
 */
export function verifyWebhookChecksum(
  eventBody: WompiWebhookEvent,
  headerChecksum: string | undefined,
  eventsSecret: string
): boolean {
  try {
    const expectedHex = computeWebhookChecksum(eventBody, eventsSecret).toLowerCase();
    const candidateHex = (headerChecksum || eventBody?.signature?.checksum || "").trim().toLowerCase();
    if (expectedHex.length !== candidateHex.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(expectedHex, "utf8"),
      Buffer.from(candidateHex, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Firma HMAC-SHA256 para notificar de forma segura desde este microservicio hacia la tienda/web principal.
 */
export function signStoreCallbackPayload(rawJson: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawJson, "utf8").digest("hex");
}
