import dotenv from "dotenv";
import pg from "pg";

dotenv.config();
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn("DATABASE_URL is not set. Set backend/.env before starting API.");
}
export const pool = new Pool({
  connectionString,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
});

export const query = (text, params = []) => pool.query(text, params);

export const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
