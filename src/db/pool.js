const { Pool } = require("pg");
const { env } = require("../config/env");

let pool;

function getPool() {
  if (!env.databaseUrl) {
    return null;
  }

  if (!pool) {
    pool = new Pool({ connectionString: env.databaseUrl });
  }

  return pool;
}

module.exports = { getPool };
