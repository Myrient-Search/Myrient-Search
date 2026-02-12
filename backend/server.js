const express = require("express");
require("dotenv").config();

const twitch_client_id = process.env.TWITCH_CLIENT_ID;
const twitch_client_secret = process.env.TWITCH_CLIENT_SECRET;

const app = express();
const PORT = 3000;

require('./routes/index.js')(app);

app.use(express.json());

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
