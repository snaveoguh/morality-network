// Smoke test: write → update → read → close → delete a TradeDecision.
// Run: DATABASE_URL='...' node scripts/smoke-trade-decisions.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function main() {
  const id = "smoke_" + Date.now();
  const cloid = "0x" + Math.random().toString(16).slice(2).padStart(32, "0").slice(0, 32);
  const opened = new Date();

  console.log("→ INSERT");
  await sql`
    INSERT INTO pooter.trade_decisions (
      id, cloid, wallet, market_symbol, venue, direction, leverage,
      opened_at, entry_notional_usd, signal_source, signal_confidence,
      kelly_fraction, stop_loss_pct, take_profit_pct, trailing_stop_pct,
      entry_rationale
    ) VALUES (
      ${id}, ${cloid}, '0xtest', 'BTC', 'hyperliquid-perp', 'long', 10,
      ${opened}, 100.50, 'composite:long', 0.72, 0.20, 0.03, 0.20, 0.05,
      ${sql.json({ reason: "smoke test" })}
    )
  `;

  console.log("→ UPDATE runtime");
  await sql`
    UPDATE pooter.trade_decisions
    SET high_water_mark = 75000.50,
        dynamic_tp_levels = ${sql.json([76000, 77500, 79000])}::jsonb,
        updated_at = NOW()
    WHERE cloid = ${cloid}
  `;

  console.log("→ SELECT");
  const rows = await sql`SELECT id, cloid, market_symbol, direction, leverage, signal_source, kelly_fraction, high_water_mark, dynamic_tp_levels, entry_rationale, closed_at FROM pooter.trade_decisions WHERE cloid = ${cloid}`;
  console.log(JSON.stringify(rows[0], null, 2));

  console.log("→ CLOSE");
  await sql`
    UPDATE pooter.trade_decisions
    SET closed_at = NOW(),
        exit_reason = 'take-profit',
        exit_rationale = ${sql.json({ tp_level_hit: 76000 })}
    WHERE cloid = ${cloid}
  `;

  console.log("→ VERIFY closed");
  const rows2 = await sql`SELECT closed_at, exit_reason, exit_rationale FROM pooter.trade_decisions WHERE cloid = ${cloid}`;
  console.log(JSON.stringify(rows2[0], null, 2));

  console.log("→ CLEANUP");
  await sql`DELETE FROM pooter.trade_decisions WHERE cloid = ${cloid}`;

  console.log("✅ smoke test passed");
  await sql.end();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
