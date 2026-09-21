import { z } from 'zod';
import {
  PROTOCOL_VERSION,
  SUPPORTED_INTERVALS,
  NETWORK_REPORT_MAX_JITTER_MS,
  NETWORK_REPORT_MAX_LATENCY_MS,
  NETWORK_REPORT_MAX_SAMPLE_COUNT,
  SYMBOL,
} from './constants.js';

const protocolVersionSchema = z.literal(PROTOCOL_VERSION);
const symbolSchema = z.literal(SYMBOL);
const intervalSchema = z.enum(SUPPORTED_INTERVALS);
const channelSchema = z.enum(['trades', 'book', 'candle']);
const deliveryTierSchema = z.enum(['full', 'degraded', 'minimal']);
const tierOverrideSchema = z.enum(['full', 'degraded', 'minimal', 'auto']);
const tradeSideSchema = z.enum(['buy', 'sell']);
const bookSideSchema = z.enum(['bid', 'ask']);

const decimalStringSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Must be a decimal string');

const nonNegativeDecimalStringSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a non-negative decimal string');

export const candleSchema = z.object({
  openTimeMs: z.number().int().nonnegative(),
  closeTimeMs: z.number().int().nonnegative(),
  open: decimalStringSchema,
  high: decimalStringSchema,
  low: decimalStringSchema,
  close: decimalStringSchema,
  volume: nonNegativeDecimalStringSchema,
  complete: z.boolean(),
});

export const subscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  protocolVersion: protocolVersionSchema,
  symbol: symbolSchema,
  interval: intervalSchema,
  channels: z.array(channelSchema).min(1),
});

export const unsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  protocolVersion: protocolVersionSchema,
  channels: z.array(channelSchema).optional(),
});

export const pingMessageSchema = z.object({
  type: z.literal('ping'),
  protocolVersion: protocolVersionSchema,
  nonce: z.string().min(1).max(128),
});

export const networkReportMessageSchema = z.object({
  type: z.literal('network_report'),
  protocolVersion: protocolVersionSchema,
  latencyMs: z
    .number()
    .finite()
    .nonnegative()
    .max(NETWORK_REPORT_MAX_LATENCY_MS),
  jitterMs: z
    .number()
    .finite()
    .nonnegative()
    .max(NETWORK_REPORT_MAX_JITTER_MS),
  sampleCount: z
    .number()
    .int()
    .positive()
    .max(NETWORK_REPORT_MAX_SAMPLE_COUNT),
});

export const tierOverrideMessageSchema = z.object({
  type: z.literal('tier_override'),
  protocolVersion: protocolVersionSchema,
  tier: tierOverrideSchema,
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  pingMessageSchema,
  networkReportMessageSchema,
  tierOverrideMessageSchema,
]);

export const welcomeMessageSchema = z.object({
  type: z.literal('welcome'),
  protocolVersion: protocolVersionSchema,
  connectionId: z.string().min(1),
  symbol: symbolSchema,
  serverTimeMs: z.number().int().nonnegative(),
});

export const pongMessageSchema = z.object({
  type: z.literal('pong'),
  protocolVersion: protocolVersionSchema,
  nonce: z.string().min(1),
});

export const tradeMessageSchema = z.object({
  type: z.literal('trade'),
  protocolVersion: protocolVersionSchema,
  id: z.string().min(1),
  symbol: symbolSchema,
  timestampMs: z.number().int().nonnegative(),
  price: decimalStringSchema,
  quantity: nonNegativeDecimalStringSchema,
  side: tradeSideSchema,
});

export const bookDeltaMessageSchema = z.object({
  type: z.literal('book_delta'),
  protocolVersion: protocolVersionSchema,
  symbol: symbolSchema,
  seq: z.string().regex(/^\d+$/),
  timestampMs: z.number().int().nonnegative(),
  changes: z
    .array(
      z.object({
        side: bookSideSchema,
        price: decimalStringSchema,
        quantity: nonNegativeDecimalStringSchema,
      }),
    )
    .min(1),
});

export const candleMessageSchema = z.object({
  type: z.literal('candle'),
  protocolVersion: protocolVersionSchema,
  symbol: symbolSchema,
  interval: intervalSchema,
  candle: candleSchema,
});

export const tierStatusMessageSchema = z.object({
  type: z.literal('tier_status'),
  protocolVersion: protocolVersionSchema,
  tier: deliveryTierSchema,
  overrideActive: z.boolean(),
  overrideTier: deliveryTierSchema.nullable(),
  targetHz: z.number().positive(),
  minDeliveryIntervalMs: z.number().int().positive(),
});

export const subscriptionAckMessageSchema = z.object({
  type: z.literal('subscription_ack'),
  protocolVersion: protocolVersionSchema,
  symbol: symbolSchema,
  interval: intervalSchema,
  channels: z.array(channelSchema),
});

export const errorMessageSchema = z.object({
  type: z.literal('error'),
  protocolVersion: protocolVersionSchema,
  code: z.string().min(1),
  message: z.string().min(1),
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeMessageSchema,
  pongMessageSchema,
  tradeMessageSchema,
  bookDeltaMessageSchema,
  candleMessageSchema,
  tierStatusMessageSchema,
  subscriptionAckMessageSchema,
  errorMessageSchema,
]);

export const orderBookSnapshotSchema = z.object({
  symbol: symbolSchema,
  sequence: z.string().regex(/^\d+$/),
  timestampMs: z.number().int().nonnegative(),
  bids: z.array(z.tuple([decimalStringSchema, nonNegativeDecimalStringSchema])),
  asks: z.array(z.tuple([decimalStringSchema, nonNegativeDecimalStringSchema])),
});

export const candlesQuerySchema = z.object({
  symbol: symbolSchema,
  interval: intervalSchema,
  limit: z.coerce.number().int().positive().max(1000).default(300),
});

export const orderBookQuerySchema = z.object({
  symbol: symbolSchema,
});
