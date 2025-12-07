import express from "express";

const app = express();
const port = process.env.PORT || 3000;

// Basit bir HTTP endpoint
app.get("/", (req, res) => res.send("Bot is running!"));

// Sunucuyu başlat
app.listen(port, () => {
  console.log(`Web server aktif: ${port}`);
});

// Burada hiçbir bot kodu yok, sadece sunucu çalışıyor
