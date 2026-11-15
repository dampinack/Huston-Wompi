import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface OrderRecord {
  id: number;
  reference: string;
  external_order_id: string | null;
  amount_in_cents: number;
  currency: string;
  customer_email: string | null;
  customer_name: string | null;
  description: string | null;
  status: string;
  wompi_transaction_id: string | null;
  payment_method_type: string | null;
  redirect_url: string | null;
  callback_notify_url: string | null;
  metadata_json: string | null;
  environment: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderInput {
  reference: string;
  externalOrderId?: string;
  amountInCents: number;
  currency: string;
  customerEmail?: string;
  customerName?: string;
  description?: string;
  redirectUrl?: string;
  callbackNotifyUrl?: string;
  metadata?: Record<string, unknown>;
  environment: string;
}

export class GatewayDatabase {
  private db: DatabaseSync;

  constructor(dbFilePath: string) {
    const dir = path.dirname(dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(dbFilePath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference TEXT NOT NULL UNIQUE,
        external_order_id TEXT,
        amount_in_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        customer_email TEXT,
        customer_name TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        wompi_transaction_id TEXT,
        payment_method_type TEXT,
        redirect_url TEXT,
        callback_notify_url TEXT,
        metadata_json TEXT,
        environment TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_orders_external_id ON orders(external_order_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

      CREATE TABLE IF NOT EXISTS webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        wompi_tx_id TEXT,
        reference TEXT,
        status TEXT,
        checksum_valid INTEGER NOT NULL,
        raw_payload TEXT NOT NULL,
        received_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS payment_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wompi_source_id INTEGER NOT NULL UNIQUE,
        customer_email TEXT NOT NULL,
        source_type TEXT NOT NULL,
        status TEXT NOT NULL,
        environment TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  createOrder(input: CreateOrderInput): OrderRecord {
    const stmt = this.db.prepare(`
      INSERT INTO orders (
        reference, external_order_id, amount_in_cents, currency,
        customer_email, customer_name, description, redirect_url,
        callback_notify_url, metadata_json, environment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.reference,
      input.externalOrderId ?? null,
      input.amountInCents,
      input.currency,
      input.customerEmail ?? null,
      input.customerName ?? null,
      input.description ?? null,
      input.redirectUrl ?? null,
      input.callbackNotifyUrl ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.environment
    );

    const created = this.getOrderByReference(input.reference);
    if (!created) throw new Error("No se pudo recuperar la orden recien creada.");
    return created;
  }

  getOrderByReference(reference: string): OrderRecord | undefined {
    const stmt = this.db.prepare(`SELECT * FROM orders WHERE reference = ?`);
    return stmt.get(reference) as OrderRecord | undefined;
  }

  listOrders(limit = 50): OrderRecord[] {
    const stmt = this.db.prepare(`SELECT * FROM orders ORDER BY id DESC LIMIT ?`);
    return stmt.all(limit) as unknown as OrderRecord[];
  }

  updateOrderFromTransaction(params: {
    reference: string;
    status: string;
    wompiTransactionId?: string;
    paymentMethodType?: string;
  }): OrderRecord | undefined {
    const stmt = this.db.prepare(`
      UPDATE orders
      SET status = ?,
          wompi_transaction_id = COALESCE(?, wompi_transaction_id),
          payment_method_type = COALESCE(?, payment_method_type),
          updated_at = datetime('now')
      WHERE reference = ?
    `);
    stmt.run(
      params.status,
      params.wompiTransactionId ?? null,
      params.paymentMethodType ?? null,
      params.reference
    );
    return this.getOrderByReference(params.reference);
  }

  logWebhookEvent(params: {
    eventType: string;
    wompiTxId?: string;
    reference?: string;
    status?: string;
    checksumValid: boolean;
    rawPayload: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO webhook_events (
        event_type, wompi_tx_id, reference, status, checksum_valid, raw_payload
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      params.eventType,
      params.wompiTxId ?? null,
      params.reference ?? null,
      params.status ?? null,
      params.checksumValid ? 1 : 0,
      params.rawPayload
    );
  }
}
