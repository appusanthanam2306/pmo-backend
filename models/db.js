const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER || "santhanamsaravanan", // adjust if needed
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "pmo_tracking",
  password: process.env.DB_PASSWORD || "", // set if needed
  port: process.env.DB_PORT || 5432,
});

module.exports = pool;
