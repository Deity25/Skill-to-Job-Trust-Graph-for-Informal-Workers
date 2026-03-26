import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: node scripts/run-sql.js <sql-file>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Update backend/.env first.");
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), fileArg);

const run = async () => {
  const sql = await fs.readFile(sqlPath, "utf8");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
  });

  try {
    await pool.query(sql);
    console.log(`Applied SQL file: ${sqlPath}`);
  } catch (error) {
    console.error(`Failed SQL file: ${sqlPath}`);
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();
