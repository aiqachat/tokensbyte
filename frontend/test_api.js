const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    sub: "test-id",
    username: "admin",
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
  },
  "tokensbyte-change-me"
);
console.log(token);
