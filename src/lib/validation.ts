import { z } from 'zod';
export const quantity = z.coerce
  .number()
  .positive()
  .max(1e9)
  .refine(
    (n) => Number.isFinite(n) && Math.abs(n * 1e6 - Math.round(n * 1e6)) < 0.001,
    'Usa hasta seis decimales.',
  );
export const money = z.coerce
  .number()
  .min(0)
  .max(1e12)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.001, 'Usa hasta dos decimales.');
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});
export const lineSchema = z.object({
  product_id: z.uuid(),
  presentation_id: z.uuid(),
  quantity,
  price: money.optional(),
  discount: money.default(0),
  serial: z.string().max(200).optional(),
  lot: z.string().max(200).optional(),
});
export const paymentSchema = z.object({
  account_id: z.uuid(),
  amount: money,
  reference: z.string().max(200).optional(),
});
export const documentSchema = z.object({
  kind: z.enum(['sale', 'purchase', 'quote']),
  branch_id: z.uuid(),
  warehouse_id: z.uuid(),
  party_id: z.uuid().nullable().optional(),
  lines: z.array(lineSchema).min(1).max(200),
  payments: z.array(paymentSchema).max(10).default([]),
  credit: z.boolean().default(false),
  due_date: z.iso.date().optional(),
  deferred: z.boolean().default(false),
  notes: z.string().max(2000).default(''),
  address: z.string().max(1000).default(''),
  transport: money.default(0),
  extra_cost: money.default(0),
  valid_until: z.iso.date().optional(),
  origin_id: z.uuid().optional(),
  exchange_for: z.uuid().optional(),
});
export const commandSchema = z.object({
  business_id: z.uuid(),
  request_id: z.uuid(),
  action: z.string().min(1).max(60),
  data: z.record(z.string(), z.unknown()),
});
export const productSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  price: money,
  cost: money.default(0),
  minimum: z.coerce.number().min(0),
  unit: z.string().min(1).max(30),
  fractional: z.boolean(),
  barcode: z.string().max(100).default(''),
  category: z.string().max(80).default(''),
  brand: z.string().max(80).default(''),
  description: z.string().max(2000).default(''),
});
