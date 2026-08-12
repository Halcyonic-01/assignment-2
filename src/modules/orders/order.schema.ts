import { z } from 'zod';

export const OrderItemInputSchema = z.object({
  product_id: z.string().uuid('Invalid product_id format'),
  quantity: z.number().int('Quantity must be an integer').positive('Quantity must be greater than 0'),
}).strict(); // strict() ensures client CANNOT send price or total

export const CreateOrderSchema = z.object({
  items: z.array(OrderItemInputSchema).min(1, 'Order must contain at least one item'),
}).strict();

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
