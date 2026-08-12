import { z } from 'zod';

export const CreateProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  price: z.number().int('Price must be an integer').positive('Price must be greater than 0'),
  category: z.string().min(1, 'Category is required'),
  stock: z.number().int('Stock must be an integer').min(0, 'Stock cannot be negative').default(0),
});

export const UpdateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().int().positive().optional(),
  category: z.string().min(1).optional(),
  stock: z.number().int().min(0).optional(),
});

export const SearchProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
  category: z.string().optional(),
  min_price: z.coerce.number().int().min(0).optional(),
  max_price: z.coerce.number().int().min(0).optional(),
  available: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  sort: z.enum(['price_asc', 'price_desc', 'created_at']).default('created_at'),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type SearchProductsQuery = z.infer<typeof SearchProductsQuerySchema>;
