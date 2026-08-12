import sql from '../../db/index.js';

export class OutboxPoller {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Process pending outbox events using FOR UPDATE SKIP LOCKED
   * Safe for multi-instance horizontal scaling
   */
  public async processEvents() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      await sql.begin(async (tx) => {
        const events = await tx`
          SELECT id, event_type, payload, created_at
          FROM outbox
          WHERE processed = FALSE
          ORDER BY created_at ASC
          LIMIT 20
          FOR UPDATE SKIP LOCKED;
        `;

        for (const event of events) {
          try {
            // Emits ORDER_CREATED event notification
            console.log(`[EVENT EMITTED] ${event.event_type} (${event.id}):`, JSON.stringify(event.payload));

            await tx`
              UPDATE outbox
              SET processed = TRUE, processed_at = NOW()
              WHERE id = ${event.id};
            `;
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`[EVENT ERROR] Failed to process event ${event.id}:`, errorMsg);
            await tx`
              UPDATE outbox
              SET error_reason = ${errorMsg}
              WHERE id = ${event.id};
            `;
          }
        }
      });
    } catch (err) {
      console.error('[OUTBOX POLLER ERROR]:', err);
    } finally {
      this.isRunning = false;
    }
  }

  public start(intervalMs: number = 3000) {
    console.log(`📡 Outbox event poller started (polling every ${intervalMs}ms)...`);
    this.timer = setInterval(() => this.processEvents(), intervalMs);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('🛑 Outbox event poller stopped.');
    }
  }
}

export const outboxPoller = new OutboxPoller();
