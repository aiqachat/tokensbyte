const { Client } = require("pg");
const client = new Client("postgres://tokensapi:tokensapi@localhost:5432/tokensapi");

async function main() {
  await client.connect();
  await client.query("ALTER TABLE channels ADD COLUMN IF NOT EXISTS group_aid TEXT DEFAULT ''");
  await client.end();
}
main();
