import {
  clientOrderLinkSchema,
  createClientOrderLinkRequestSchema,
  publicOrderStateSchema,
  publicOrderSubmissionSchema,
  type ClientOrderLink,
  type Order,
} from "@kv-infra/shared";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import type {
  ClientOrderLinkRecord,
  ClientOrderLinkRepository,
} from "./client-order-link.repository.js";

type PublicLinkConfiguration = {
  appBaseUrl: string;
  sessionSecret: string;
  skuFormToken: string;
  timeZone: string;
};

type PublicOrderService = {
  create(input: unknown, idempotencyKey?: string): Promise<Order>;
  get(orderId: string): Promise<Order>;
  list(): Promise<Order[]>;
};

type PublicSkuService = {
  create(input: unknown): Promise<unknown>;
  list(): Promise<unknown[]>;
};

const LINK_ID_PATTERN = /^COL-(\d{4})-(\d{4,})$/;

const digest = (value: string) => createHash("sha256").update(value).digest();
const safeEqual = (left: string, right: string) =>
  timingSafeEqual(digest(left), digest(right));
const configuredSecret = (value: string) =>
  value.length >= 32 && !/^replace(?:_|-)?with/i.test(value);

const localDate = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

export const generateNextClientOrderLinkId = (
  year: number,
  records: Array<Pick<ClientOrderLinkRecord, "linkId">>,
) => {
  const highest = records.reduce((current, record) => {
    const match = LINK_ID_PATTERN.exec(record.linkId);
    return match && Number(match[1]) === year
      ? Math.max(current, Number(match[2]))
      : current;
  }, 0);
  return `COL-${year}-${String(highest + 1).padStart(4, "0")}`;
};

const publicSummary = (order: Order) => ({
  orderId: order.orderId,
  customerName: order.customerName,
  dateReceived: order.dateReceived,
  totalCartons: order.totalCartons,
  totalQuantity: order.totalQuantity,
  grossWeight: order.grossWeight,
  volume: order.volume,
  actualGrossWeight: order.actualGrossWeight ?? null,
  actualVolume: order.actualVolume ?? null,
  items: order.items.map((item) => ({
    sku: item.sku,
    itemDescription: item.itemDescription,
    unit: item.unit,
    cartons: item.cartons,
    totalQuantity: item.totalQuantity,
    grossWeight: item.grossWeight,
    volume: item.volume,
  })),
});

export class PublicLinkService {
  private readonly submissions = new Map<string, Promise<unknown>>();
  private linkCreationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: ClientOrderLinkRepository,
    private readonly orders: PublicOrderService,
    private readonly skus: PublicSkuService,
    private readonly config: PublicLinkConfiguration = {
      appBaseUrl: env.APP_BASE_URL,
      sessionSecret: env.SESSION_SECRET,
      skuFormToken: env.PUBLIC_SKU_FORM_TOKEN,
      timeZone: env.OPERATOR_TIME_ZONE,
    },
  ) {}

  createClientOrderLink(input: unknown) {
    const operation = this.linkCreationQueue.then(() =>
      this.createClientOrderLinkOnce(input),
    );
    this.linkCreationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async createClientOrderLinkOnce(input: unknown) {
    this.assertSigningConfigured();
    const request = createClientOrderLinkRequestSchema.parse(input);
    const records = await this.repository.list();
    const now = new Date();
    const linkId = generateNextClientOrderLinkId(now.getFullYear(), records);
    const record: Omit<ClientOrderLinkRecord, "rowNumber"> = {
      linkId,
      customerName: request.customerName,
      createdAt: now.toISOString(),
      orderId: null,
      submittedAt: null,
      disabledAt: null,
    };
    await this.repository.append(record);
    return clientOrderLinkSchema.parse(
      this.operatorRecord({ ...record, rowNumber: records.length + 2 }, null),
    );
  }

  async listClientOrderLinks() {
    this.assertSigningConfigured();
    const [records, orders] = await Promise.all([
      this.repository.list(),
      this.orders.list(),
    ]);
    const orderMap = new Map(orders.map((order) => [order.orderId, order]));
    return records
      .map((record) =>
        clientOrderLinkSchema.parse(
          this.operatorRecord(
            record,
            record.orderId ? (orderMap.get(record.orderId) ?? null) : null,
          ),
        ),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async disableClientOrderLink(linkId: string) {
    const record = (await this.repository.list()).find(
      (candidate) => candidate.linkId === linkId,
    );
    if (!record)
      throw new AppError(404, "CLIENT_ORDER_LINK_NOT_FOUND", "Link not found");
    const disabledAt = record.disabledAt ?? new Date().toISOString();
    if (!record.disabledAt)
      await this.repository.disable(record.rowNumber, disabledAt);
    const order = record.orderId ? await this.orders.get(record.orderId) : null;
    return clientOrderLinkSchema.parse(
      this.operatorRecord({ ...record, disabledAt }, order),
    );
  }

  async publicOrderState(token: string) {
    const record = await this.recordForToken(token);
    return this.stateForRecord(record);
  }

  submitPublicOrder(token: string, input: unknown) {
    const existing = this.submissions.get(token);
    if (existing) return existing;
    const submission = this.submitPublicOrderOnce(token, input).finally(() =>
      this.submissions.delete(token),
    );
    this.submissions.set(token, submission);
    return submission;
  }

  publicSkuFormStatus(token: string) {
    this.assertSkuToken(token);
    return { enabled: true as const };
  }

  async createPublicSku(token: string, input: unknown) {
    this.assertSkuToken(token);
    return this.skus.create(input);
  }

  publicTools() {
    const enabled = configuredSecret(this.config.skuFormToken);
    return {
      skuFormUrl: enabled
        ? `${this.config.appBaseUrl.replace(/\/$/, "")}/add-sku/${encodeURIComponent(this.config.skuFormToken)}`
        : null,
    };
  }

  private async submitPublicOrderOnce(token: string, input: unknown) {
    const request = publicOrderSubmissionSchema.parse(input);
    const record = await this.recordForToken(token);
    if (record.orderId) return this.stateForRecord(record);
    const order = await this.orders.create(
      {
        customerName: record.customerName,
        dateReceived: localDate(this.config.timeZone),
        orderNotes: request.orderNotes,
        items: request.items,
      },
      `client-order-link:${record.linkId}`,
    );
    const submittedAt = new Date().toISOString();
    await this.repository.markSubmitted(
      record.rowNumber,
      order.orderId,
      submittedAt,
    );
    return publicOrderStateSchema.shape.data.parse({
      status: "SUBMITTED",
      customerName: record.customerName,
      summary: publicSummary(order),
    });
  }

  private async stateForRecord(record: ClientOrderLinkRecord) {
    if (record.disabledAt)
      throw new AppError(
        410,
        "CLIENT_ORDER_LINK_DISABLED",
        "This order link is no longer available",
      );
    if (!record.orderId) {
      return publicOrderStateSchema.shape.data.parse({
        status: "OPEN",
        customerName: record.customerName,
        skus: await this.skus.list(),
      });
    }
    const order = await this.orders.get(record.orderId);
    if (order.status === "COMPLETED")
      throw new AppError(
        410,
        "CLIENT_ORDER_LINK_SHIPPED",
        "This order has shipped and its link is no longer available",
      );
    return publicOrderStateSchema.shape.data.parse({
      status: "SUBMITTED",
      customerName: record.customerName,
      summary: publicSummary(order),
    });
  }

  private async recordForToken(token: string) {
    this.assertSigningConfigured();
    const [linkId, signature, extra] = token.split(".");
    if (
      !linkId ||
      !signature ||
      extra ||
      !safeEqual(signature, this.sign(linkId))
    )
      throw new AppError(
        404,
        "CLIENT_ORDER_LINK_NOT_FOUND",
        "This order link is invalid",
      );
    const record = (await this.repository.list()).find(
      (candidate) => candidate.linkId === linkId,
    );
    if (!record)
      throw new AppError(
        404,
        "CLIENT_ORDER_LINK_NOT_FOUND",
        "This order link is invalid",
      );
    return record;
  }

  private operatorRecord(
    record: ClientOrderLinkRecord,
    order: Order | null,
  ): ClientOrderLink {
    const status = record.disabledAt
      ? "DISABLED"
      : order?.status === "COMPLETED"
        ? "SHIPPED"
        : record.orderId
          ? "SUBMITTED"
          : "OPEN";
    return {
      linkId: record.linkId,
      customerName: record.customerName,
      createdAt: record.createdAt,
      orderId: record.orderId,
      submittedAt: record.submittedAt,
      disabledAt: record.disabledAt,
      status,
      url: `${this.config.appBaseUrl.replace(/\/$/, "")}/order/${this.token(record.linkId)}`,
    };
  }

  private token(linkId: string) {
    return `${linkId}.${this.sign(linkId)}`;
  }

  private sign(linkId: string) {
    return createHmac("sha256", this.config.sessionSecret)
      .update(`client-order-link:${linkId}`)
      .digest("base64url");
  }

  private assertSigningConfigured() {
    if (this.config.sessionSecret.length < 32)
      throw new AppError(
        503,
        "PUBLIC_LINKS_NOT_CONFIGURED",
        "SESSION_SECRET must be configured before public order links can be used",
      );
  }

  private assertSkuToken(token: string) {
    if (
      !configuredSecret(this.config.skuFormToken) ||
      !safeEqual(token, this.config.skuFormToken)
    )
      throw new AppError(
        404,
        "PUBLIC_SKU_FORM_NOT_FOUND",
        "This SKU form link is invalid",
      );
  }
}
