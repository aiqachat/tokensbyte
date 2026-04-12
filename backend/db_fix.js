const { Client } = require("pg");
const client = new Client("postgres://tokensapi:tokensapi@localhost:5432/tokensapi");

async function main() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");
    
    // Add admin_remark
    const res1 = await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_remark TEXT DEFAULT ''");
    console.log("admin_remark:", res1);
    
    const res2 = await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS register_ip TEXT DEFAULT ''");
    console.log("register_ip:", res2);

    // Also alter channel_configs
    await client.query("ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS remark TEXT DEFAULT ''").catch(e => console.error(e));

    // Add user_level affiliate rules
    await client.query("ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS invite_reward_inviter DOUBLE PRECISION DEFAULT 0.0").catch(e => console.error(e));
    await client.query("ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS invite_reward_invitee DOUBLE PRECISION DEFAULT 0.0").catch(e => console.error(e));
    await client.query("ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS daily_invite_limit INTEGER DEFAULT 10").catch(e => console.error(e));
    await client.query("ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS marketing_enabled INTEGER DEFAULT 0").catch(e => console.error(e));

  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}
main();
