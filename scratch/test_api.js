const axios = require('axios');
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  {
    sub: "admin-id", // I need the actual user ID for admin
    username: "admin",
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
  },
  "tokensbyte-change-me"
);

axios.get('http://localhost:3000/api/v1/user/profile', {
  headers: { Authorization: `Bearer ${token}` }
})
.then(res => console.log("SUCCESS:", res.data))
.catch(err => {
  console.log("ERROR STATUS:", err.response?.status);
  console.log("ERROR DATA:", err.response?.data);
});
