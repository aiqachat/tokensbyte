const { Client } = require("pg");
const client = new Client("postgres://tokensapi:tokensapi@localhost:5432/tokensapi");

async function main() {
  await client.connect();
  await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS used_quota DOUBLE PRECISION DEFAULT 0.0");
  await client.end();
}
main();
