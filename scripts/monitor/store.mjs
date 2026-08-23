// =============================================================================
// STORES for monitor_source_state — one Postgres-backed, one in-memory.
//
// The runner talks to a store through three calls:
//   ensureRows(rows)        insert-if-absent the static registry rows
//   selectAuto(ids)         rows for these ids, stalest first
//                           (last_fetched_at ASC NULLS FIRST, then id)
//   writeResult(row)        persist one fetch outcome
// The in-memory store backs the vitest suite so it can run with a stubbed
// clock and fetch; the Postgres store is what production uses, connecting as
// the scoped monitor role via MONITOR_DB_URL (never the service role).
// =============================================================================

function compareStalest(a, b) {
  const ta = a.last_fetched_at ? new Date(a.last_fetched_at).getTime() : -Infinity;
  const tb = b.last_fetched_at ? new Date(b.last_fetched_at).getTime() : -Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.registry_id < b.registry_id ? -1 : a.registry_id > b.registry_id ? 1 : 0;
}

export function createMemoryStore(initialRows = []) {
  const rows = new Map(initialRows.map((r) => [r.registry_id, { ...r }]));
  return {
    rows,
    async ensureRows(staticRows) {
      let inserted = 0;
      for (const r of staticRows) {
        if (!rows.has(r.registry_id)) {
          rows.set(r.registry_id, {
            registry_id: r.registry_id,
            ruleset_version: r.ruleset_version,
            last_fetched_at: null,
            http_status: null,
            content_hash: null,
            previous_hash: null,
            changed_at: null,
            diff_status: r.diff_status,
            consecutive_failures: 0,
          });
          inserted += 1;
        } else if (rows.get(r.registry_id).ruleset_version !== r.ruleset_version) {
          rows.get(r.registry_id).ruleset_version = r.ruleset_version;
        }
      }
      return inserted;
    },
    async selectAuto(ids) {
      const set = new Set(ids);
      return [...rows.values()].filter((r) => set.has(r.registry_id)).map((r) => ({ ...r })).sort(compareStalest);
    },
    async writeResult(row) {
      rows.set(row.registry_id, { ...rows.get(row.registry_id), ...row });
    },
    async close() {},
  };
}

export async function createPgStore(connectionString) {
  const { default: pg } = await import("pg");
  // TLS is governed by the URL (`?sslmode=verify-full`), never relaxed here.
  const pool = new pg.Pool({ connectionString, max: 2 });
  return {
    async ensureRows(staticRows) {
      let inserted = 0;
      for (const r of staticRows) {
        const res = await pool.query(
          `INSERT INTO public.monitor_source_state (registry_id, ruleset_version, diff_status)
           VALUES ($1, $2, $3)
           ON CONFLICT (registry_id) DO UPDATE
             SET ruleset_version = EXCLUDED.ruleset_version
             WHERE monitor_source_state.ruleset_version IS DISTINCT FROM EXCLUDED.ruleset_version
           RETURNING (xmax = 0) AS inserted`,
          [r.registry_id, r.ruleset_version, r.diff_status],
        );
        if (res.rows[0]?.inserted) inserted += 1;
      }
      return inserted;
    },
    async selectAuto(ids) {
      if (ids.length === 0) return [];
      const res = await pool.query(
        `SELECT registry_id, ruleset_version, last_fetched_at, http_status, content_hash,
                previous_hash, changed_at, diff_status, consecutive_failures
           FROM public.monitor_source_state
          WHERE registry_id = ANY($1::text[])
          ORDER BY last_fetched_at ASC NULLS FIRST, registry_id ASC`,
        [ids],
      );
      return res.rows;
    },
    async writeResult(row) {
      await pool.query(
        `UPDATE public.monitor_source_state
            SET last_fetched_at = $2, http_status = $3, content_hash = $4, previous_hash = $5,
                changed_at = $6, diff_status = $7, consecutive_failures = $8
          WHERE registry_id = $1`,
        [
          row.registry_id, row.last_fetched_at, row.http_status, row.content_hash,
          row.previous_hash, row.changed_at, row.diff_status, row.consecutive_failures,
        ],
      );
    },
    async close() {
      await pool.end();
    },
  };
}
