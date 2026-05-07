const { Client } = require("pg");
const client = new Client("postgres://tokensapi:tokensapi@localhost:5432/tokensapi");
async function main() {
  await client.connect();
  const r1 = await client.query("SELECT id, name, eid FROM forward_rules LIMIT 5");
  console.log("Forward Rules:", r1.rows);
  const r2 = await client.query("SELECT id, name, pid FROM billing_rules LIMIT 5");
  console.log("Billing Rules:", r2.rows);
  await client.end();
}
main();
