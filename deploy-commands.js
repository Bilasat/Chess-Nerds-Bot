import fs from 'fs';
import path from 'path';
import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

// Komutları oku
const commands = [];
const commandsPath = path.join(process.cwd(), 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const imported = await import(`./commands/${file}`);
  
  // hem named export hem default export kontrolü
  const command = imported.data ?? imported.default?.data;
  if (!command) {
    console.warn(`⚠️ ${file} içinde geçerli data export bulunamadı`);
    continue;
  }

  commands.push(command.toJSON());
}

// Discord’a gönder
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Slash komutları yükleniyor...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Slash komutları başarıyla yüklendi ✔️');
  } catch (err) {
    console.error(err);
  }
})();
