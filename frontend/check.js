const { Client } = require('pg');
const client = new Client('postgres://tokensapi:tokensapi@localhost:5432/tokensapi');
client.connect().then(() => {
    client.query('SELECT mid, name, model_id FROM models ORDER BY id DESC LIMIT 5;', (err, res) => {
        if (err) throw err;
        console.table(res.rows);
        client.end();
    });
});
