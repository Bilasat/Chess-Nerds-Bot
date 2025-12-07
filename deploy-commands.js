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
  const command = (await import(`./commands/${file}`)).default;
  commands.push(command.data.toJSON());
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
