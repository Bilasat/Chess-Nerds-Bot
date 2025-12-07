import express from "express";
import "./index.js"; // <-- Botu burada başlatıyoruz

const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot Çalışıyor!");
});

app.listen(port, () => {
  console.log("Web server aktif: " + port);
});
