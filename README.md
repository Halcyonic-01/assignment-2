# Reneo — Backend Developer Internship Technical Assessment

A high-performance, multi-tenant backend API for the **Reneo** commerce platform in Africa. Built using **Node.js, TypeScript, Fastify, and PostgreSQL (Supabase)** with atomic concurrency controls, Row Level Security (RLS), full-text search across 1,000,000+ products, idempotency support, and transactional outbox event processing.

---

## 🏛️ System Architecture Diagram

```
                 +-----------------------------------+
                 |           API Clients             |
                 |  (Sellers / Customer Web & Mobile)|
                 +-----------------+-----------------+
                                   |
                                   v  (HTTPS / JWT Auth)
                 +-----------------+-----------------+
                 |       Fastify HTTP Gateway        |
                 |  - Zod Request Validation         |
                 |  - Idempotency Header Middleware  |
                 |  - Role-Based Access Control      |
                 +-----------------+-----------------+
                                   |
                +------------------+------------------+
                |                                     |
                v                                     v
   +-------------------------+           +-------------------------+
   |   Product & Search API  |           |     Order Service       |
   | (GIN Index / tsvector)  |           | (SELECT ... FOR UPDATE) |
   +------------+------------+           +------------+------------+
                |                                     |
                +------------------+------------------+
                                   | (Database Connection Pool)
                                   v
                 +-----------------+-----------------+
                 |  PostgreSQL / Supabase Database   |
                 |  - Row Level Security (RLS)       |
                 |  - Check Constraints (stock >= 0) |
                 |  - Transactional Outbox Table     |
                 +-----------------+-----------------+
                                   |
                                   v (Poll / NOTIFY)
                 +-----------------+-----------------+
                 |     Outbox Event Processor        |
                 |   (ORDER_CREATED Notifications)   |
                 +-----------------------------------+
```

---

## ⚡ Key Technical Features & Rubric Highlights

### 1. Bulletproof Concurrency Control (B1 — 20 Points)
* **Problem**: Stock remaining is 1. Two customers place an order for the last item at the exact same millisecond.
* **Our Solution**: Inside a PostgreSQL transaction, we lock the inventory row using explicit row locking:
  ```sql
  SELECT product_id, stock FROM inventory WHERE product_id = ANY($1) FOR UPDATE;
  ```
* **Mechanics**:
  1. Transaction A and Transaction B arrive simultaneously.
  2. Transaction A executes `SELECT ... FOR UPDATE` first and obtains an exclusive row lock on the inventory row.
  3. Transaction B blocks instantly waiting for Transaction A to complete.
  4. Transaction A verifies `stock = 1`, deducts stock (`UPDATE inventory SET stock = 0`), inserts the order, and commits.
  5. Transaction B unblocks, re-evaluates the locked inventory row, reads `stock = 0`, and raises a `409 Conflict (Out of stock)` exception.
  6. **Backstop**: Database `CHECK (stock >= 0)` constraint prevents negative stock values under all circumstances.

### 2. Server-Side Price Integrity (A5 — 10 Points)
* Clients **never** send product prices or order totals in request payloads.
* The API validation schema explicitly rejects payloads containing `price` or `total_amount`.
* The server resolves prices directly from the `products` table inside the database transaction.

### 3. High-Scale Search & Pagination (A4 — 5 Points)
* Designed to handle **1,000,000+ products** using PostgreSQL Full-Text Search.
* Utilizes a `STORED` `tsvector` column with `GIN` indexing (`search_vector`), composite B-Tree indexes on `(category, price)`, and partial indexes excluding archived products (`WHERE is_archived = FALSE`).

#### EXPLAIN ANALYZE Output for Main Search Query:
```text
Limit  (cost=12.45..45.12 rows=20 width=214) (actual time=0.082..0.210 rows=20 loops=1)
  ->  Nested Loop Left Join  (cost=12.45..1250.30 rows=850 width=214) (actual time=0.080..0.205 rows=20 loops=1)
        ->  Index Scan using idx_products_cat_price on products p  (cost=0.42..450.12 rows=850 width=180) (actual time=0.055..0.112 rows=20 loops=1)
              Index Cond: ((category = 'Electronics'::text) AND (price >= 1000))
              Filter: (is_archived = false)
        ->  Index Scan using idx_inventory_pkey on inventory i  (cost=0.28..0.94 rows=1 width=38) (actual time=0.004..0.004 rows=1 loops=20)
              Index Cond: (product_id = p.id)
Planning Time: 0.185 ms
Execution Time: 0.245 ms
```

### 4. Idempotency (B2 — 5 Points)
* Supports `Idempotency-Key` HTTP header.
* Duplicate requests with the same key return the cached `201/200` response payload without re-processing stock deduction or creating duplicate orders.

### 5. Transactional Outbox Pattern (B3 — 5 Points)
* When an order is placed, an `ORDER_CREATED` event record is written to the `outbox` table inside the **same database transaction**.
* An independent background `OutboxPoller` processes unprocessed events using `FOR UPDATE SKIP LOCKED` for zero event loss and reliable seller notifications.

---

## 🛠️ Getting Started & Local Setup

### Prerequisites
* Node.js v18+ & npm
* PostgreSQL (local instance or Supabase project)

### Installation
```bash
# 1. Clone the repository
git clone https://github.com/Halcyonic-01/assignment-2.git
cd assignment-2

# 2. Install dependencies
npm install

# 3. Environment setup
cp .env.example .env
```

### Database Migration & Seeding
```bash
# Run PostgreSQL database migrations
npm run migrate

# Seed initial test data (Sellers, Stores, Products, Customers)
npm run seed

# (Optional) Seed 1,000,000 products for performance & search testing
npm run seed:1m
```

### Running the API
```bash
# Start development server with auto-reload
npm run dev

# API Server runs at http://localhost:3000
# OpenAPI / Swagger UI documentation at http://localhost:3000/docs
```

---

## 🧪 Automated Tests & Concurrency Verification

To run the complete automated test suite (covering all 5 mandatory rubric scenarios):

```bash
# Run all tests (sequential execution)
npm run test

# Run ONLY the Concurrency Race Condition Test (Test 5 / Scenario B1)
npm run test:concurrency
```

---

## 📑 PART D — Written Answers

### D1. Scaling Architecture (100 to 10,000,000 Users)

When scaling Reneo from 100 users to 10 million users and millions of products:

#### Architecture Evolution:
1. **Database Layer (First Bottleneck)**:
   - **Read Replicas**: Route read-heavy search requests (`GET /products`) to PostgreSQL read replicas using PgBouncer for connection pooling.
   - **Sharding / Partitioning**: Partition `orders` and `order_items` tables by `created_at` (range partitioning) or hash-partition by `store_id`.
2. **Caching & Search Acceleration**:
   - Introduce **Redis** for product catalog caching and idempotency key lock storage with TTL.
   - Offload complex full-text search to **Elasticsearch / Meilisearch** once catalog exceeds 10M products.
3. **Asynchronous Order Processing & Microservices**:
   - Replace local outbox poller with **Apache Kafka** or **AWS SQS / RabbitMQ** for reliable, asynchronous notification dispatch and inventory syncing.
4. **What breaks first?**: Database connection saturation and lock contention on high-demand flash-sale inventory items. We mitigate this with connection poolers (PgBouncer) and Redis pre-allocation for high-volume flash sales.

### D2. What we did not have time to do & 2-Day Roadmap
If given two additional days, we would add:
1. **Redis-based Distributed Locking (Redlock)** for multi-region active-active database clusters.
2. **Stripe / Mobile Money Webhook integration** for payment settlement workflows.
3. **Prometheus + Grafana Metrics** monitoring database transaction latency, lock wait durations, and API throughput.

### D3. AI & Library Transparency
* **Libraries Used**: `fastify` (HTTP framework), `postgres` (Native Postgres driver), `zod` (Validation), `vitest` + `supertest` (Testing), `@fastify/swagger` (OpenAPI documentation).
* **AI Assistance**: AI assistants were utilized for rapid boilerplate generation, migration script structuring, and double-checking concurrency locking strategies.

---

## 📝 License
ISC License
