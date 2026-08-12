import sql from '../../db/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { CreateOrderInput } from './order.schema.js';

export class OrderService {
  /**
   * Create order with explicit ROW-LEVEL LOCKING (SELECT FOR UPDATE)
   * Prevents race conditions and overselling under heavy concurrency (B1)
   * Product IDs are sorted before locking to prevent deadlocks
   */
  static async createOrder(customerId: string, input: CreateOrderInput, idempotencyKey?: string) {
    // Check Idempotency Key first if present (B2)
    if (idempotencyKey) {
      const [existingOrder] = await sql`
        SELECT id, customer_id, status, total_amount, response_payload, created_at
        FROM orders
        WHERE idempotency_key = ${idempotencyKey};
      `;

      if (existingOrder) {
        if (existingOrder.response_payload) {
          return { cached: true, order: existingOrder.response_payload };
        }
        return { cached: true, order: existingOrder };
      }
    }

    // Fix 4: Deduplicate and sort productIds to prevent deadlocks when acquiring row locks
    const productIds = [...new Set(input.items.map(item => item.product_id))].sort();

    return await sql.begin(async (tx) => {
      // 1. Lock inventory rows in deterministic sort order to prevent deadlocks
      const lockedInventories = await tx`
        SELECT product_id, stock
        FROM inventory
        WHERE product_id = ANY(${productIds})
        ORDER BY product_id ASC
        FOR UPDATE;
      `;

      const inventoryMap = new Map<string, number>();
      for (const inv of lockedInventories) {
        inventoryMap.set(inv.product_id, inv.stock);
      }

      // 2. Fetch products and resolve REAL prices from server (A5: Server owns the truth)
      const products = await tx`
        SELECT id, name, price, is_archived, store_id
        FROM products
        WHERE id = ANY(${productIds});
      `;

      const productMap = new Map<string, { name: string; price: number; is_archived: boolean; store_id: string }>();
      for (const p of products) {
        productMap.set(p.id, {
          name: p.name as string,
          price: p.price as number,
          is_archived: p.is_archived as boolean,
          store_id: p.store_id as string,
        });
      }

      let orderTotal = 0;
      const orderItemRecords: {
        product_id: string;
        quantity: number;
        unit_price: number;
        subtotal: number;
      }[] = [];

      // 3. Validate each item and calculate totals
      for (const item of input.items) {
        const product = productMap.get(item.product_id);
        if (!product || product.is_archived) {
          throw new NotFoundError(`Product ${item.product_id} not found or unavailable`);
        }

        const currentStock = inventoryMap.get(item.product_id) ?? 0;
        if (currentStock < item.quantity) {
          throw new ConflictError(`Out of stock: Product '${product.name}' only has ${currentStock} item(s) remaining`);
        }

        // Update inventoryMap in place to handle duplicate product_ids correctly
        inventoryMap.set(item.product_id, currentStock - item.quantity);

        const unitPrice = product.price; // SERVER-SIDE TRUTH PRICE — never from client
        const subtotal = unitPrice * item.quantity;
        orderTotal += subtotal;

        orderItemRecords.push({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: unitPrice,
          subtotal,
        });
      }

      // 4. Deduct inventory stock atomically
      for (const item of input.items) {
        await tx`
          UPDATE inventory
          SET stock = stock - ${item.quantity}, updated_at = NOW()
          WHERE product_id = ${item.product_id};
        `;
      }

      // 5. Create Order Record
      const [order] = await tx`
        INSERT INTO orders (customer_id, status, total_amount, idempotency_key)
        VALUES (${customerId}, 'CONFIRMED', ${orderTotal}, ${idempotencyKey || null})
        RETURNING id, customer_id, status, total_amount, idempotency_key, created_at;
      `;

      // 6. Create Order Item Records
      const itemsToInsert = orderItemRecords.map(item => ({
        order_id: order.id,
        ...item,
      }));

      const insertedItems = await tx`
        INSERT INTO order_items ${tx(itemsToInsert, 'order_id', 'product_id', 'quantity', 'unit_price', 'subtotal')}
        RETURNING id, order_id, product_id, quantity, unit_price, subtotal;
      `;

      const responsePayload = {
        ...order,
        items: insertedItems,
      };

      // Store cached response for idempotency
      if (idempotencyKey) {
        await tx`
          UPDATE orders
          SET response_payload = ${tx.json(responsePayload)}
          WHERE id = ${order.id};
        `;
      }

      // 7. Emit ORDER_CREATED Event to Outbox Table (B3: Transactional Outbox)
      await tx`
        INSERT INTO outbox (event_type, payload)
        VALUES ('ORDER_CREATED', ${tx.json({
          order_id: order.id,
          customer_id: customerId,
          total_amount: orderTotal,
          items: insertedItems,
          timestamp: new Date().toISOString(),
        })});
      `;

      return { cached: false, order: responsePayload };
    });
  }

  /**
   * Get orders for customer or seller
   */
  static async getOrders(userId: string, role: 'CUSTOMER' | 'SELLER') {
    if (role === 'CUSTOMER') {
      return await sql`
        SELECT o.id, o.status, o.total_amount, o.created_at,
               json_agg(json_build_object(
                 'id', oi.id,
                 'product_id', oi.product_id,
                 'product_name', p.name,
                 'quantity', oi.quantity,
                 'unit_price', oi.unit_price,
                 'subtotal', oi.subtotal
               )) as items
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE o.customer_id = ${userId}
        GROUP BY o.id
        ORDER BY o.created_at DESC;
      `;
    } else {
      return await sql`
        SELECT o.id, o.customer_id, o.status, o.created_at,
               json_agg(json_build_object(
                 'id', oi.id,
                 'product_id', oi.product_id,
                 'product_name', p.name,
                 'quantity', oi.quantity,
                 'unit_price', oi.unit_price,
                 'subtotal', oi.subtotal
               )) as items
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        JOIN stores s ON s.id = p.store_id
        WHERE s.seller_id = ${userId}
        GROUP BY o.id
        ORDER BY o.created_at DESC;
      `;
    }
  }

  /**
   * Get single order by ID — Fix 5: enforce ownership check to prevent IDOR
   */
  static async getOrderById(userId: string, orderId: string) {
    // Must be the customer who placed it OR a seller whose products appear in the order
    const [order] = await sql`
      SELECT o.id, o.customer_id, o.status, o.total_amount, o.created_at
      FROM orders o
      WHERE o.id = ${orderId}
        AND (
          o.customer_id = ${userId}
          OR EXISTS (
            SELECT 1 FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            JOIN stores s ON s.id = p.store_id
            WHERE oi.order_id = o.id AND s.seller_id = ${userId}
          )
        );
    `;

    if (!order) {
      throw new NotFoundError('Order not found or access denied');
    }

    const items = await sql`
      SELECT oi.id, oi.product_id, p.name as product_name, oi.quantity, oi.unit_price, oi.subtotal
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ${orderId};
    `;

    return { ...order, items };
  }
}
