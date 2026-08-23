import "dotenv/config";
import express from "express";
import cors from "cors";
import routes from "./routes";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());
app.use("/api", routes);

app.listen(port, () => {
  console.log(`FOOT ANALYTICS API rodando em http://localhost:${port}`);
});
