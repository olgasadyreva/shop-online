import { Pool } from "pg";
import { databaseUrl } from "../config.js";

const pool = new Pool({
  connectionString: databaseUrl,
});

pool.on("error", (err) => {
  console.error("Непредвиденная ошибка пула pg:", err.message);
});

export const connect = () => pool.connect();

export const query = (text, params) => pool.query(text, params);

export default pool;
