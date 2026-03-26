import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const parseDatabaseName = (connectionString) => {
  const url = new URL(connectionString);
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName) {
    throw new Error("Could not detect database name from DATABASE_URL");
  }
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new Error(`Unsafe database name "${dbName}" in DATABASE_URL`);
  }
  return dbName;
};

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

const run = async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Configure backend/.env first.");
  }

  const databaseName = parseDatabaseName(connectionString);
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const pool = new Pool({
    connectionString: adminUrl.toString(),
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
  });

  try {
    await pool.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `,
      [databaseName]
    );

    const dbIdent = quoteIdentifier(databaseName);
    await pool.query(`DROP DATABASE IF EXISTS ${dbIdent}`);
    await pool.query(`CREATE DATABASE ${dbIdent}`);
    console.log(`Database reset complete: ${databaseName}`);
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
