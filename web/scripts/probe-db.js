const postgres = require("postgres");
(async () => {
  const sql = postgres(
    process.env.DATABASE_URL ||
      "postgresql://postgres:sWbIaFoRPQRYekuelrnTlzheFPRNMIAE@ballast.proxy.rlwy.net:49890/railway",
  );
  const skip = ["pg_catalog", "information_schema"];
  const tables = await sql`
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname <> ALL(${skip})
    ORDER BY 1, 2
    LIMIT 200
  `;
  console.log(`Tables (${tables.length}):`);
  let lastSchema = "";
  for (const r of tables) {
    if (r.schemaname !== lastSchema) {
      console.log(`\n[${r.schemaname}]`);
      lastSchema = r.schemaname;
    }
    console.log("  " + r.tablename);
  }
  await sql.end();
})();
