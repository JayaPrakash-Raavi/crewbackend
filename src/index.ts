import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // or ".env" if you prefer

import app from "./app";

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`CORS origin: ${process.env.FRONTEND_ORIGIN}`);
});
