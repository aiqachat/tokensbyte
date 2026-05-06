const { Client } = require("pg");
const client = new Client("postgres://tokensapi:tokensapi@localhost:5432/tokensapi");

async function main() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");
    
    await client.query("UPDATE forward_rules SET eid = '1' || floor(random() * 9000 + 1000)::text WHERE eid = '' OR eid IS NULL");
    console.log("Updated forward_rules");

    await client.query("UPDATE billing_rules SET pid = '6' || floor(random() * 9000 + 1000)::text WHERE pid = '' OR pid IS NULL");
    console.log("Updated billing_rules");

  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}
main();
