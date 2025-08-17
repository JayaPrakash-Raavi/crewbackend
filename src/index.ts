import * as dotenv from "dotenv";
// load .env.local explicitly; change to ".env" if you prefer that filename
dotenv.config({ path: ".env.local" });

import app from "./app";

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`CORS origin: ${process.env.FRONTEND_ORIGIN}`);
});
