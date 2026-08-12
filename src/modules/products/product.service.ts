import sql from '../../db/index.js';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { CreateProductInput, SearchProductsQuery, UpdateProductInput } from './product.schema.js';

export class ProductService {
  /**
   * Create a new product and initialize stock (Seller only)
   */
  static async createProduct(sellerId: string, storeId: string, input: CreateProductInput) {
    return await sql.begin(async (tx) => {
      // Verify store belongs to seller
      const [store] = await tx`SELECT id FROM stores WHERE id = ${storeId} AND seller_id = ${sellerId}`;
      if (!store) {
        throw new ForbiddenError('You do not own this store');
      }

      const [product] = await tx`
        INSERT INTO products (store_id, name, description, price, category)
        VALUES (${storeId}, ${input.name}, ${input.description || null}, ${input.price}, ${input.category})
        RETURNING id, store_id, name, description, price, category, is_archived, created_at, updated_at;
      `;

      await tx`
        INSERT INTO inventory (product_id, stock)
        VALUES (${product.id}, ${input.stock})
      `;

      return {
        ...product,
        stock: input.stock,
      };
    });
  }

  /**
   * Get product by ID
   */
  static async getProductById(id: string) {
    const [product] = await sql`
      SELECT p.id, p.store_id, p.name, p.description, p.price, p.category, p.is_archived, p.created_at, p.updated_at,
             COALESCE(i.stock, 0) as stock,
             s.name as store_name, s.seller_id
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = ${id};
    `;

    if (!product || product.is_archived) {
      throw new NotFoundError('Product not found');
    }

    return product;
  }

  /**
   * Update product (Seller owner only)
   */
  static async updateProduct(sellerId: string, productId: string, input: UpdateProductInput) {
    return await sql.begin(async (tx) => {
      // Verify ownership
      const [existing] = await tx`
        SELECT p.id, s.seller_id
        FROM products p
        JOIN stores s ON s.id = p.store_id
        WHERE p.id = ${productId} AND p.is_archived = FALSE;
      `;

      if (!existing) {
        throw new NotFoundError('Product not found');
      }

      if (existing.seller_id !== sellerId) {
        throw new ForbiddenError('You can only update your own products');
      }

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.price !== undefined) updates.price = input.price;
      if (input.category !== undefined) updates.category = input.category;
      updates.updated_at = new Date();

      let updatedProduct = existing;
      if (Object.keys(updates).length > 1) {
        [updatedProduct] = await tx`
          UPDATE products
          SET ${sql(updates)}
          WHERE id = ${productId}
          RETURNING id, store_id, name, description, price, category, is_archived, created_at, updated_at;
        `;
      }

      if (input.stock !== undefined) {
        await tx`
          UPDATE inventory
          SET stock = ${input.stock}, updated_at = NOW()
          WHERE product_id = ${productId};
        `;
      }

      const [inv] = await tx`SELECT stock FROM inventory WHERE product_id = ${productId}`;

      return {
        ...updatedProduct,
        stock: inv ? inv.stock : 0,
      };
    });
  }

  /**
   * Delete / Archive product (Seller owner only)
   */
  static async deleteProduct(sellerId: string, productId: string) {
    const [existing] = await sql`
      SELECT p.id, s.seller_id
      FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = ${productId};
    `;

    if (!existing) {
      throw new NotFoundError('Product not found');
    }

    if (existing.seller_id !== sellerId) {
      throw new ForbiddenError('You can only delete your own products');
    }

    await sql`
      UPDATE products
      SET is_archived = TRUE, updated_at = NOW()
      WHERE id = ${productId};
    `;

    return { message: 'Product archived successfully' };
  }

  /**
   * High performance paginated product search across 1M+ items
   */
  static async searchProducts(query: SearchProductsQuery, sellerIdFilter?: string) {
    const { page, limit, q, category, min_price, max_price, available, sort } = query;
    const offset = (page - 1) * limit;

    // Build dynamic SQL conditions
    let searchCondition = sql`p.is_archived = FALSE`;

    if (sellerIdFilter) {
      searchCondition = sql`${searchCondition} AND s.seller_id = ${sellerIdFilter}`;
    }

    if (category) {
      searchCondition = sql`${searchCondition} AND p.category = ${category}`;
    }

    if (min_price !== undefined) {
      searchCondition = sql`${searchCondition} AND p.price >= ${min_price}`;
    }

    if (max_price !== undefined) {
      searchCondition = sql`${searchCondition} AND p.price <= ${max_price}`;
    }

    if (available === true) {
      searchCondition = sql`${searchCondition} AND i.stock > 0`;
    }

    if (q) {
      searchCondition = sql`${searchCondition} AND p.search_vector @@ plainto_tsquery('english', ${q})`;
    }

    // Determine ORDER BY
    let orderBy = sql`p.created_at DESC`;
    if (sort === 'price_asc') {
      orderBy = sql`p.price ASC, p.id ASC`;
    } else if (sort === 'price_desc') {
      orderBy = sql`p.price DESC, p.id ASC`;
    }

    const items = await sql`
      SELECT p.id, p.store_id, p.name, p.description, p.price, p.category, p.created_at,
             COALESCE(i.stock, 0) as stock,
             s.name as store_name
      FROM products p
      JOIN stores s ON s.id = p.store_id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE ${searchCondition}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset};
    `;

    const [{ count }] = await sql`
      SELECT COUNT(*) as count
      FROM products p
      JOIN stores s ON s.id = p.store_id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE ${searchCondition};
    `;

    const total = parseInt(count as string, 10);

    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Helper to run EXPLAIN ANALYZE for README documentation (Deliverable A4)
   */
  static async explainSearchQuery(query: SearchProductsQuery) {
    const { limit, q, category, min_price, max_price } = query;
    const searchCondition = sql`
      p.is_archived = FALSE
      ${category ? sql`AND p.category = ${category}` : sql``}
      ${min_price !== undefined ? sql`AND p.price >= ${min_price}` : sql``}
      ${max_price !== undefined ? sql`AND p.price <= ${max_price}` : sql``}
      ${q ? sql`AND p.search_vector @@ plainto_tsquery('english', ${q})` : sql``}
    `;

    const explainResult = await sql`
      EXPLAIN ANALYZE
      SELECT p.id, p.name, p.price, p.category
      FROM products p
      WHERE ${searchCondition}
      ORDER BY p.price ASC
      LIMIT ${limit};
    `;

    return explainResult.map(r => r['QUERY PLAN']).join('\n');
  }
}
