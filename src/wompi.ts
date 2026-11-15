import { generateIntegritySignature } from "./crypto.ts";

export type WompiEnvironment = "sandbox" | "production";

export interface WompiConfig {
  port: number;
  env: WompiEnvironment;
  publicKey: string;
  privateKey: string;
  integritySecret: string;
  eventsSecret: string;
  apiBaseUrl: string;
  widgetScriptUrl: string;
  webCheckoutUrl: string;
  defaultRedirectUrl: string;
  internalApiKey: string;
  allowedCorsOrigins: string[];
  sqliteDbPath: string;
}

export function loadWompiConfig(): WompiConfig {
  const rawEnv = (process.env.WOMPI_ENV || "sandbox").toLowerCase();
  const env: WompiEnvironment = rawEnv === "production" ? "production" : "sandbox";

  const isProd = env === "production";
  const publicKey = isProd
    ? process.env.WOMPI_PROD_PUBLIC_KEY || "pub_prod_0vsGidrn72wbGthE9BTTac9P3BXNqat7"
    : process.env.WOMPI_TEST_PUBLIC_KEY || "";

  const privateKey = isProd
    ? process.env.WOMPI_PROD_PRIVATE_KEY || ""
    : process.env.WOMPI_TEST_PRIVATE_KEY || "";

  const integritySecret = isProd
    ? process.env.WOMPI_PROD_INTEGRITY_SECRET || ""
    : process.env.WOMPI_TEST_INTEGRITY_SECRET || "";

  const eventsSecret = isProd
    ? process.env.WOMPI_PROD_EVENTS_SECRET || ""
    : process.env.WOMPI_TEST_EVENTS_SECRET || "";

  const apiBaseUrl = isProd
    ? process.env.WOMPI_PROD_API_URL || "https://api.wompi.pa/v1"
    : process.env.WOMPI_TEST_API_URL || "https://api-sandbox.wompi.pa/v1";

  const port = Number(process.env.PORT || 3000);
  const allowedCorsOrigins = (process.env.ALLOWED_CORS_ORIGINS || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    port,
    env,
    publicKey,
    privateKey,
    integritySecret,
    eventsSecret,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    widgetScriptUrl: "https://checkout.wompi.pa/widget.js",
    webCheckoutUrl: "https://checkout.wompi.pa/p/",
    defaultRedirectUrl: process.env.DEFAULT_REDIRECT_URL || `http://localhost:${port}/checkout/result`,
    internalApiKey: process.env.INTERNAL_GATEWAY_API_KEY || "",
    allowedCorsOrigins,
    sqliteDbPath: process.env.SQLITE_DB_PATH || "./data/wompi_gateway.sqlite",
  };
}

export class WompiApiClient {
  constructor(private readonly config: WompiConfig) {}

  private ensurePrivateKey(): void {
    if (!this.config.privateKey || this.config.privateKey.includes("REEMPLAZAR")) {
      throw new Error(
        `Falta configurar la Llave Privada de Wompi para el ambiente '${this.config.env}' en el archivo .env`
      );
    }
  }

  /**
   * Obtiene la informacion del comercio y los tokens firmados de aceptacion de terminos
   * requeridos para cobros por API directa (Opcion 3).
   */
  async getMerchantAcceptanceTokens(): Promise<{
    merchantName: string;
    acceptanceToken: string;
    permalink: string;
    acceptPersonalAuthToken?: string;
    personalAuthPermalink?: string;
  }> {
    if (!this.config.publicKey || this.config.publicKey.includes("REEMPLAZAR")) {
      throw new Error(`Falta configurar la Llave Publica de Wompi (${this.config.env}) en .env`);
    }
    const resp = await fetch(`${this.config.apiBaseUrl}/merchants/${this.config.publicKey}`);
    const body = (await resp.json()) as Record<string, any>;
    if (!resp.ok) {
      throw new Error(`Error consultando comercio en Wompi (${resp.status}): ${JSON.stringify(body)}`);
    }
    const data = body.data || {};
    return {
      merchantName: data.name,
      acceptanceToken: data.presigned_acceptance?.acceptance_token,
      permalink: data.presigned_acceptance?.permalink,
      acceptPersonalAuthToken: data.presigned_personal_data_auth?.acceptance_token,
      personalAuthPermalink: data.presigned_personal_data_auth?.permalink,
    };
  }

  /**
   * Consulta el estado real de una transaccion directamente en Wompi Panama por su ID.
   */
  async getTransactionById(transactionId: string): Promise<Record<string, any>> {
    const resp = await fetch(`${this.config.apiBaseUrl}/transactions/${encodeURIComponent(transactionId)}`);
    const body = (await resp.json()) as Record<string, any>;
    if (!resp.ok) {
      throw new Error(`Error consultando transaccion ${transactionId} (${resp.status}): ${JSON.stringify(body)}`);
    }
    return body.data;
  }

  /**
   * Busca transacciones asociadas a una referencia unica de orden usando la Llave Privada.
   */
  async getTransactionsByReference(reference: string): Promise<Record<string, any>[]> {
    this.ensurePrivateKey();
    const url = `${this.config.apiBaseUrl}/transactions?reference=${encodeURIComponent(reference)}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${this.config.privateKey}` },
    });
    const body = (await resp.json()) as Record<string, any>;
    if (!resp.ok) {
      throw new Error(`Error buscando referencia ${reference} (${resp.status}): ${JSON.stringify(body)}`);
    }
    return Array.isArray(body.data) ? body.data : [];
  }

  /**
   * Crea un Link de Pago dinamico via API Directa (POST /v1/payment_links).
   */
  async createPaymentLink(params: {
    name: string;
    description: string;
    singleUse: boolean;
    collectShipping?: boolean;
    amountInCents?: number;
    currency?: string;
    redirectUrl?: string;
    expiresAt?: string;
  }): Promise<Record<string, any>> {
    this.ensurePrivateKey();
    const payload: Record<string, unknown> = {
      name: params.name,
      description: params.description,
      single_use: params.singleUse,
      collect_shipping: params.collectShipping ?? false,
      currency: params.currency ?? "USD",
    };
    if (params.amountInCents !== undefined) payload.amount_in_cents = params.amountInCents;
    if (params.redirectUrl) payload.redirect_url = params.redirectUrl;
    if (params.expiresAt) payload.expires_at = params.expiresAt;

    const resp = await fetch(`${this.config.apiBaseUrl}/payment_links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.privateKey}`,
      },
      body: JSON.stringify(payload),
    });
    const body = (await resp.json()) as Record<string, any>;
    if (!resp.ok) {
      throw new Error(`Error creando payment_link en Wompi (${resp.status}): ${JSON.stringify(body)}`);
    }
    const linkData = body.data;
    return {
      ...linkData,
      checkoutUrl: `https://checkout.wompi.pa/l/${linkData.id}`,
    };
  }

  /**
   * Ejecuta un cobro por API Directa (POST /v1/transactions) usando un token de tarjeta
   * o un payment_source_id (ideal para cobros recurrentes / suscripciones / checkout propio).
   */
  async createDirectTransaction(params: {
    amountInCents: number;
    currency?: string;
    customerEmail: string;
    reference: string;
    paymentMethod?: Record<string, unknown>;
    paymentSourceId?: number;
    acceptanceToken?: string;
    redirectUrl?: string;
    customerData?: Record<string, unknown>;
  }): Promise<Record<string, any>> {
    this.ensurePrivateKey();
    const currency = params.currency ?? "USD";

    let acceptanceToken = params.acceptanceToken;
    if (!acceptanceToken) {
      const tokens = await this.getMerchantAcceptanceTokens();
      acceptanceToken = tokens.acceptanceToken;
    }

    const signature = generateIntegritySignature({
      reference: params.reference,
      amountInCents: params.amountInCents,
      currency,
      integritySecret: this.config.integritySecret,
    });

    const payload: Record<string, unknown> = {
      amount_in_cents: params.amountInCents,
      currency,
      customer_email: params.customerEmail,
      reference: params.reference,
      acceptance_token: acceptanceToken,
      signature,
    };

    if (params.paymentSourceId !== undefined) {
      payload.payment_source_id = params.paymentSourceId;
    } else if (params.paymentMethod) {
      payload.payment_method = params.paymentMethod;
    } else {
      throw new Error("Debe enviar paymentMethod (token) o paymentSourceId para cobro por API directa.");
    }

    if (params.redirectUrl) payload.redirect_url = params.redirectUrl;
    if (params.customerData) payload.customer_data = params.customerData;

    const resp = await fetch(`${this.config.apiBaseUrl}/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.privateKey}`,
      },
      body: JSON.stringify(payload),
    });
    const body = (await resp.json()) as Record<string, any>;
    if (!resp.ok) {
      throw new Error(`Error en transaccion API directa Wompi (${resp.status}): ${JSON.stringify(body)}`);
    }
    return body.data;
  }
}
