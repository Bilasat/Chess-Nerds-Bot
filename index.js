// index.js — async-aware final sürüm
import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits, EmbedBuilder, Partials, PermissionsBitField } from "discord.js";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

import {
  getProfile,
  loadProfilesAsync,
  saveProfiles,
  setAboutMe
} from "./profileDB.js";

import {
  loadAfkAsync,
  getAfk,
  setAfk,
  removeAfk
} from "./afkDB.js";

import fs from "fs";

function loadConfig() {
  return JSON.parse(fs.readFileSync("./config.json", "utf8"));
}

function saveConfig(config) {
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}
const afkExitInProgress = new Set();

async function handleAfkExit(message) {
  const member = message.member;
  if (!member) return false;

  if (message.content?.startsWith(".afk")) return false;

  // 🚨 SERT LOCK — await'ten ÖNCE
  if (afkExitInProgress.has(member.id)) return false;

  const afk = getAfk(message.guild.id, member.id);
  if (!afk) return false;

  afkExitInProgress.add(member.id);

  // 🔥 AFK'yı ANINDA sil (sync)
  removeAfk(message.guild.id, member.id);

  // nick geri al
  const oldNick = afk.oldNick;
  if (oldNick == null) {
    member.setNickname(null).catch(() => {});
  } else {
    member.setNickname(oldNick).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("AFK mode is off.")
    .setDescription("Welcome back 👋")
    .setTimestamp();

  const m = await message.channel.send({ embeds: [embed] }).catch(() => null);
  if (m) setTimeout(() => m.delete().catch(() => {}), 3000);

  // 🧹 lock temizliği
  setTimeout(() => {
    afkExitInProgress.delete(member.id);
  }, 1500);

  return true;
}
// AFK notify cooldown
const afkNotifyCooldown = new Map();
const AFK_NOTIFY_COOLDOWN_MS = 30_000; // 30 saniye

const activityTypes = {
  PLAYING: 0,
  STREAMING: 1,
  LISTENING: 2,
  WATCHING: 3,
  COMPETING: 5
};

const AFK_REACTION = "<:w_check:1447598180463280291>"; 

const PREFIX = ".";
const WINNER_ROLE_ID = "1445571202050424933";
const ANNOUNCE_CHANNEL_ID = "1381653146731942079"; // dikkat: eğer farklı -> düzelt
const LEADERBOARD_CHANNEL_ID = "1448662725738627173";  // sabit leaderboard kanalı
let   LEADERBOARD_MESSAGE_ID = "1448677383107514479"; // daha sonra kaydedilecek mesaj ID

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// ---------------------------------------------
// Helper safeFetchJson
async function safeFetchJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------
// Leaderboard embed generator (awaits profiles)
async function generateLeaderboardEmbed(guild) {
  const profiles = await loadProfilesAsync();
  const arr = Object.entries(profiles)
    .map(([id, data]) => ({
      id,
      total: data.wins ? Object.values(data.wins).reduce((a, b) => a + b, 0) : 0,
      wins: data.wins || {}
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const embed = new EmbedBuilder()
    .setTitle("🏆 Tournament Leaderboard")
    .setColor(0xffd700)
    .setTimestamp()
    .setFooter({ text: new Date().toLocaleString() });

  let desc = "";

  for (let i = 0; i < 5; i++) {
    const userData = arr[i];
    if (!userData) { desc += `**${i + 1}.** -\n`; continue; }

    let member = guild.members.cache.get(userData.id);
    if (!member) member = await guild.members.fetch(userData.id).catch(()=>null);

    const displayName = member
      ? `${member.user.username} (${member.toString()})`
      : `Unknown (${userData.id}) (<@${userData.id}>)`;

    const categories = Object.entries(userData.wins)
      .map(([k, v]) => `• ${k}: ${v}`)
      .join("\n") || "-";

    desc += `**${i + 1}. ${displayName}** — ${userData.total} win(s)\n${categories}\n\n`;
  }

  embed.setDescription(desc.trim());
  return embed;
}

// ----------------------------------------------------
// Ready: ensure DB loaded once, create/update leaderboard message
client.once("clientReady", async () => {
  console.log(`Bot aktif → ${client.user.tag}`);
  // ensure profiles loaded into RAM (so getProfile calls are safe)
  try {
    await loadProfilesAsync();
  } catch (e) {
    console.error("loadProfilesAsync error on ready:", e);
  }
    try {
    await loadAfkAsync();
  } catch (e) {
    console.error("AFK DB yüklenemedi:", e);
  }

  // register slash commands light
  try {
    client.application.commands.set([
      { name: "ping", description: "Botun gecikmesini ölçer." },
      { name: "send", description: "Belirtilen kanala mesaj gönder" }
    ]);
  } catch (e) { /* ignore */ }

  // Create/update fixed leaderboard message
  setTimeout(async () => {
    try {
      const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID).catch(()=>null);
      if (!channel || !channel.isTextBased()) return;
      const embed = await generateLeaderboardEmbed(channel.guild);

      if (LEADERBOARD_MESSAGE_ID) {
        const msg = await channel.messages.fetch(LEADERBOARD_MESSAGE_ID).catch(()=>null);
        if (msg) {
          await msg.edit({ embeds: [embed] }).catch(()=>{});
          return;
        }
      }
      const newMsg = await channel.send({ embeds: [embed] }).catch(()=>null);
      if (newMsg) LEADERBOARD_MESSAGE_ID = newMsg.id;
    } catch (e) {
      console.error("Leaderboard init error:", e);
    }
  }, 2000);
  
  
const config = loadConfig();
const status = config.status;

client.user.setPresence({
  activities: [
    {
      name: status.text,
      type: activityTypes[status.type] ?? 0
    }
  ],
  status: status.presence ?? "online"
});


});

// ----------------------------------------------------
// Welcome DM
client.on("guildMemberAdd", async (member) => {
  try {
    getProfile(member.id); // ensures entry
    const embed = new EmbedBuilder()
      .setTitle("Hey! 👋")
      .setColor(0x00ff00)
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(        
		"Welcome to our server! Here you'll find tournaments, conversations, and plenty of chess <:chess_brilliant_move:1447598008702210151>\n\n" +
        "**Our Lichess Team:**\nhttps://lichess.org/team/bedbot\n" +
		"**Our ChessCom Team:**\nhttps://www.chess.com/club/bedbot\n\n" +	
		"If you wish, you can customize your profile by adding your lichess and chesscom accounts to our <#1446777954091663571> channel :alien:\n"
		)
      .setFooter({ text: new Date().toLocaleString() })
      .setTimestamp();
    await member.send({ embeds: [embed] }).catch(()=>{});
  } catch (err) {
    console.log("DM gönderilemedi:", err);
  }
});

// ----------------------------------------------------
// Message commands
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
	const member = message.member;
	if (!member) return;
let afkExitedThisMessage = false;	
afkExitedThisMessage = await handleAfkExit(message);	// ⚠️ Bu noktadan sonra bu message AFK sayılmaz


	// ---------------- AFK SİSTEMİ ----------------
if (!member) return;


/* Etiket / reply AFK kontrolü */
const targets = new Set();

// mention
message.mentions.users.forEach(u => {
  if (!u.bot) targets.add(u.id);
});

// reply
if (message.reference?.messageId) {
  const ref = await message.channel.messages
    .fetch(message.reference.messageId)
    .catch(()=>null);
  if (ref && !ref.author.bot) targets.add(ref.author.id);
}

for (const userId of targets) {
	
  if (afkExitedThisMessage && userId === message.author.id) continue; // 🚫 bu message’ta AFK’dan çıkan kullanıcıyı YOK SAY	 
  if (userId === message.author.id) continue;
  const afk = getAfk(message.guild.id, userId);
  if (!afk) continue;

const key = `${message.guild.id}:${message.channel.id}:${userId}`;
  const lastSent = afkNotifyCooldown.get(key);

  if (lastSent && Date.now() - lastSent < AFK_NOTIFY_COOLDOWN_MS) {
    continue; // ⛔ cooldown
  }

  afkNotifyCooldown.set(key, Date.now());

  const diff = Date.now() - afk.since;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const timeText =
    hrs > 0 ? `${hrs} hr ${mins % 60} mins` : `${mins} mins`;

  let text = `:zzz: User is **AFK**, for ${timeText}.`;
  if (afk.note) {
    text += ` Note: "${afk.note}"`;
  }

  // 🔥 REPLY olarak gönder
  await message.reply({ content: text }).catch(() => {});
  break; // spam engeli

}
// ------------------------------------------------

    if (!message.content.startsWith(PREFIX)) return;
    // ensure profiles loaded (cheap no-op if already loaded)
    try { await loadProfilesAsync(); } catch (e) {}

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const guild = message.guild;
    if (!guild) return;

    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const requireAdmin = () => {
      if (!isAdmin) { message.reply("You do not have the necessary permissions to use this command."); return false; }
      return true;
    };

// .afk
if (cmd === "afk") {
  const note = args.join(" ").trim() || null;

  // zaten AFK mı?
  if (getAfk(message.author.id)) {
    return message.reply("You're already AFK.");
  }

  // nick ayarla
  const oldNick = message.member.nickname; // null olabilir
  const baseNick = message.member.displayName;
  const afkNick = baseNick.startsWith("[AFK]")
    ? baseNick
    : `[AFK] ${baseNick}`;

  await message.member.setNickname(afkNick).catch(()=>{});

  setAfk(message.guild.id, message.author.id, {
    since: Date.now(),
    note,
	oldNick
  });
  
const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("AFK Mode is On")
    .setDescription(
      `You're now AFK.` +
      `${note ? `\n📝 **Note:** ${note}` : ""}`
    )
    .setTimestamp();
  message.react(AFK_REACTION).catch(() => {});

  // ⚠️ SENİN NOTUNA UYGUN:
  // AFKSİN mesajı SİLİNMEZ
  return message.channel.send({ embeds: [embed] });
}


    // .setaboutme
    if (cmd === "setaboutme") {
      const text = args.join(" ").trim();
      if (!text) return message.reply("You should write something.");
      if (text.length > 256) return message.reply("The 'About Me' section cannot be longer than 256 characters.");
      setAboutMe(message.author.id, text);
      return message.reply("The 'About Me' section has been updated!");
    }

    // .removeaboutme
    if (cmd === "removeaboutme") {
      const profile = getProfile(message.author.id);
      profile.aboutMe = "";
      await saveProfiles().catch(()=>{});
      return message.reply("The 'About Me' section has been removed.");
    }

    // .profile
    if (cmd === "profile") {
      const user = message.mentions.users.first() || message.author;
      const profile = getProfile(user.id) || {};
      const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(()=>null);

      // anlık fetches (if usernames present)
      if (profile.lichess && profile.lichess.username) {
        const lichData = await safeFetchJson(`https://lichess.org/api/user/${encodeURIComponent(profile.lichess.username)}`);
        if (lichData && lichData.perfs) {
          profile.lichess.bullet = lichData.perfs?.bullet?.rating ?? profile.lichess.bullet ?? "-";
          profile.lichess.blitz  = lichData.perfs?.blitz?.rating ?? profile.lichess.blitz ?? "-";
          profile.lichess.rapid  = lichData.perfs?.rapid?.rating ?? profile.lichess.rapid ?? "-";
          profile.lichess.classic= lichData.perfs?.classical?.rating ?? profile.lichess.classic ?? "-";
          await saveProfiles().catch(()=>{});
        }
      }
      if (profile.chesscom && profile.chesscom.username) {
        const chessData = await safeFetchJson(`https://api.chess.com/pub/player/${encodeURIComponent(profile.chesscom.username)}/stats`);
        if (chessData) {
          profile.chesscom.bullet  = chessData.chess_bullet?.last?.rating ?? profile.chesscom.bullet ?? "-";
          profile.chesscom.blitz   = chessData.chess_blitz?.last?.rating ?? profile.chesscom.blitz ?? "-";
          profile.chesscom.rapid   = chessData.chess_rapid?.last?.rating ?? profile.chesscom.rapid ?? "-";
          profile.chesscom.classic = chessData.chess_daily?.last?.rating ?? profile.chesscom.classic ?? "-";
          await saveProfiles().catch(()=>{});
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`${user.username}`)
        .setColor(0x0099ff)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: new Date().toLocaleString() })
        .setTimestamp();

      if (profile.aboutMe && profile.aboutMe.trim() !== "") { embed.setDescription(`***${profile.aboutMe}***`); }

      const totalWins =
        profile.wins && Object.keys(profile.wins).length
          ? Object.values(profile.wins).reduce((a, b) => a + b, 0)
          : 0;

      embed.addFields(
        { name: "📅 Join Date", value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : "Bilinmiyor", inline: false },
        { name: "Lichess", value: profile.lichess && profile.lichess.username ? `User: **${profile.lichess.username}**\nBullet: ${profile.lichess.bullet ?? "-"}\nBlitz: ${profile.lichess.blitz ?? "-"}\nRapid: ${profile.lichess.rapid ?? "-"}\nClassical: ${profile.lichess.classic ?? "-"}` : "-", inline: true },
        { name: "Chess.com", value: profile.chesscom && profile.chesscom.username ? `User: **${profile.chesscom.username}**\nBullet: ${profile.chesscom.bullet ?? "-"}\nBlitz: ${profile.chesscom.blitz ?? "-"}\nRapid: ${profile.chesscom.rapid ?? "-"}\nClassical: ${profile.chesscom.classic ?? "-"}` : "-", inline: true },
        { name: "🏆 TOTAL TOURNAMENT WINS", value: `**${totalWins}**`, inline: false },
        { name: "🏆 Tournament Achievements", value: profile.wins && Object.keys(profile.wins).length ? Object.entries(profile.wins).map(([k, v]) => `• ${k}: ${v}`).join("\n") : "-", inline: false }
      );

      return message.channel.send({ embeds: [embed] });
    }

    // .linklichess (admin)
    if (cmd === "linklichess") {
      if (!requireAdmin()) return;
      const member = message.mentions.members.first();
      const target = member ? member.id : message.author.id;
      const username = member ? args[1] : args[0];
      if (!username) return message.reply("Lichess kullanıcı adı girmedin.");
      const data = await safeFetchJson(`https://lichess.org/api/user/${encodeURIComponent(username)}`);
      if (!data) return message.reply("Bu Lichess hesabı bulunamadı.");
      const profile = getProfile(target);
      profile.lichess = {
        username,
        bullet: data.perfs?.bullet?.rating ?? "-",
        blitz: data.perfs?.blitz?.rating ?? "-",
        rapid: data.perfs?.rapid?.rating ?? "-",
        classic: data.perfs?.classical?.rating ?? "-"
      };
      await saveProfiles().catch(()=>{});
      return message.reply(`Lichess hesabı bağlandı: **${username}**`);
    }

    // .unlinklichess (admin)
    if (cmd === "unlinklichess") {
      if (!requireAdmin()) return;
      const member = message.mentions.members.first();
      const target = member ? member.id : message.author.id;
      const profile = getProfile(target);
      profile.lichess = null;
      await saveProfiles().catch(()=>{});
      return message.reply("Lichess bağlantısı kaldırıldı.");
    }

    // .linkchesscom (admin)
    if (cmd === "linkchesscom") {
      if (!requireAdmin()) return;
      const member = message.mentions.members.first();
      const target = member ? member.id : message.author.id;
      const username = member ? args[1] : args[0];
      if (!username) return message.reply("Chess.com kullanıcı adı girmedin.");
      const data = await safeFetchJson(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/stats`);
      if (!data) return message.reply("Bu Chess.com hesabı bulunamadı.");
      const profile = getProfile(target);
      profile.chesscom = {
        username,
        bullet: data.chess_bullet?.last?.rating ?? "-",
        blitz: data.chess_blitz?.last?.rating ?? "-",
        rapid: data.chess_rapid?.last?.rating ?? "-",
        classic: data.chess_daily?.last?.rating ?? "-"
      };
      await saveProfiles().catch(()=>{});
      return message.reply(`Chess.com hesabı bağlandı: **${username}**`);
    }

    // .unlinkchesscom (admin)
    if (cmd === "unlinkchesscom") {
      if (!requireAdmin()) return;
      const member = message.mentions.members.first();
      const target = member ? member.id : message.author.id;
      const profile = getProfile(target);
      profile.chesscom = null;
      await saveProfiles().catch(()=>{});
      return message.reply("Chess.com bağlantısı kaldırıldı.");
    }

    // .addwin (admin)
    if (cmd === "addwin") {
      if (!requireAdmin()) return;
      const member = message.mentions.members.first();
      if (!member) return message.reply("Bir kullanıcı etiketlemen lazım.");
      const category = args.slice(1).join(" ").trim();
      if (!category) return message.reply("Kategori yazmadın.");
      const profile = getProfile(member.id);
      if (!profile.wins) profile.wins = {};
      profile.wins[category] = (profile.wins[category] || 0) + 1;
      await saveProfiles().catch(()=>{});

      // role handling
      const role = guild.roles.cache.get(WINNER_ROLE_ID);
      if (role) {
        try {
          for (const [, m] of role.members) {
            await m.roles.remove(role).catch(()=>{});
          }
          await member.roles.add(role).catch(()=>{});
        } catch (e) { console.error("Rol yönetimi hatası:", e); }
      }

      // announcement
      try {
        const announceChannel = await guild.channels.fetch(ANNOUNCE_CHANNEL_ID).catch(()=>null);
        if (announceChannel && announceChannel.isTextBased()) {
          const congrEmbed = new EmbedBuilder()
            .setTitle("🎉 Congratulations!")
            .setDescription(`Player **${member.user.username}** won the tournament in category **${category}**!`)
            .addFields(
              { name: "Given Role", value: role ? `<@&${role.id}>` : "Rol tanımlı değil", inline: true },
              { name: "User", value: `${member.user.tag}`, inline: true }
            )
            .setColor(0x00ff00)
            .setFooter({ text: new Date().toLocaleString() })
            .setTimestamp();
          await announceChannel.send({ embeds: [congrEmbed] }).catch(()=>{});
        }
      } catch (e) { console.error("Tebrik mesajı gönderilemedi:", e); }

      // update fixed leaderboard message
      try {
        const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID).catch(()=>null);
        if (channel && channel.isTextBased()) {
          const embed = await generateLeaderboardEmbed(guild);
          if (LEADERBOARD_MESSAGE_ID) {
            const msg = await channel.messages.fetch(LEADERBOARD_MESSAGE_ID).catch(()=>null);
            if (msg) await msg.edit({ embeds: [embed] }).catch(()=>{});
            else {
              const newMsg = await channel.send({ embeds: [embed] }).catch(()=>null);
              if (newMsg) LEADERBOARD_MESSAGE_ID = newMsg.id;
            }
          } else {
            const newMsg = await channel.send({ embeds: [embed] }).catch(()=>null);
            if (newMsg) LEADERBOARD_MESSAGE_ID = newMsg.id;
          }
        }
      } catch (e) { console.error("Leaderboard güncellenemedi (addwin):", e); }

      return message.reply(`${member.user.username} → ${category} kategorisine 1 win eklendi!`);
    }

    // .removewin (admin)
    if (cmd === "removewin") {
      if (!requireAdmin()) return;
      const member = message.mentions.members.first();
      if (!member) return message.reply("Bir kullanıcı etiketlemen lazım.");
      const category = args.slice(1).join(" ");
      if (!category) return message.reply("Bir kategori yazmalısın.");
      const profile = getProfile(member.id);
      if (!profile.wins || !profile.wins[category]) return message.reply("Bu kategoride win yok.");
      profile.wins[category]--;
      if (profile.wins[category] <= 0) delete profile.wins[category];
      await saveProfiles().catch(()=>{});

      // update fixed leaderboard message (same logic as addwin)
      try {
        const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID).catch(()=>null);
        if (channel && channel.isTextBased()) {
          const embed = await generateLeaderboardEmbed(guild);
          if (LEADERBOARD_MESSAGE_ID) {
            const msg = await channel.messages.fetch(LEADERBOARD_MESSAGE_ID).catch(()=>null);
            if (msg) await msg.edit({ embeds: [embed] }).catch(()=>{});
            else {
              const newMsg = await channel.send({ embeds: [embed] }).catch(()=>null);
              if (newMsg) LEADERBOARD_MESSAGE_ID = newMsg.id;
            }
          } else {
            const newMsg = await channel.send({ embeds: [embed] }).catch(()=>null);
            if (newMsg) LEADERBOARD_MESSAGE_ID = newMsg.id;
          }
        }
      } catch (e) { console.error("Leaderboard güncellenemedi (removewin):", e); }

      return message.reply(`${member.user.username} → ${category} win kaldırıldı`);
    }

    // .leaderboard (DM)
    if (cmd === "leaderboard") {
      const profiles = await loadProfilesAsync();
      const arr = Object.entries(profiles)
        .map(([id, data]) => ({ id, total: data.wins ? Object.values(data.wins).reduce((a,b)=>a+b,0) : 0, wins: data.wins || {} }))
        .sort((a,b) => b.total - a.total)
        .slice(0,5);

      const embed = new EmbedBuilder()
        .setTitle("🏆 Tournament Leaderboard")
        .setColor(0xffd700)
        .setFooter({ text: new Date().toLocaleString() })
        .setTimestamp();

      const txt =
        arr.length && arr.some(x=>x.total>0)
          ? arr.map((u,i)=>{
              const m = guild.members.cache.get(u.id);
              const name = m ? m.user.username : `Unknown (${u.id})`;
              const winTxt = Object.entries(u.wins).map(([k,v])=>`• ${k}: ${v}`).join("\n");
              return `**${i+1}. ${name}** — ${u.total} win\n${winTxt}`;
            }).join("\n\n")
          : "-";

      embed.setDescription(txt);
      return message.author.send({ embeds: [embed] }).catch(()=>{ message.reply("DM gönderilemedi."); });
    }

  } catch (err) {
    console.error("Hata:", err);
    try { await message.reply("Bir hata oluştu, loglar kontrol ediliyor."); } catch {}
  }
});

// SLASH KOMUTLARI
	
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // -----------------------------------------
  // /send komutu (SADECE ADMIN)
  // -----------------------------------------
 if (interaction.commandName === "send") {

  if (!interaction.memberPermissions?.has("Administrator")) {
    return interaction.reply({
      content: "❌ Only admins can use this command.",
      flags: 64
    });
  }

  const modal = new ModalBuilder()
    .setCustomId("send_modal")
    .setTitle("Mesaj Gönder");

  const channelIdInput = new TextInputBuilder()
    .setCustomId("send_channel_id")
    .setLabel("Gönderilecek Kanal (ID)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const messageIdsInput = new TextInputBuilder()
    .setCustomId("send_message_ids")
    .setLabel("KanalID:MesajID (her satıra bir)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const textInput = new TextInputBuilder()
    .setCustomId("send_text")
    .setLabel("Gönderilecek metin (opsiyonel)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(channelIdInput),
    new ActionRowBuilder().addComponents(messageIdsInput),
    new ActionRowBuilder().addComponents(textInput)
  );

  await interaction.showModal(modal);
}
});
// MODAL SUBMIT HANDLER

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== "send_modal") return;

  await interaction.deferReply({ flags: 64 });

  const channelId = interaction.fields.getTextInputValue("send_channel_id").trim();
  const messageIdsRaw = interaction.fields.getTextInputValue("send_message_ids");
  const text = interaction.fields.getTextInputValue("send_text")?.trim();
  if (!text && !messageIdsRaw.trim()) {
  return interaction.editReply(
    "❌ En azından **bir metin** ya da **bir mesaj ID** girmelisin."
  );
}

  const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!targetChannel || !targetChannel.isTextBased()) {
    return interaction.editReply("❌ Kanal bulunamadı veya mesaj atılamıyor.");
  }

  const messageIds = messageIdsRaw
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  const files = [];
  const hasMessageIds = messageIdsRaw.trim().length > 0;

  for (const line of messageIds) {
  const [sourceChannelId, messageId] = line.split(":").map(x => x.trim());
  if (!sourceChannelId || !messageId) continue;

  const sourceChannel = await interaction.guild.channels
    .fetch(sourceChannelId)
    .catch(() => null);

  if (!sourceChannel || !sourceChannel.isTextBased()) continue;

  const msg = await sourceChannel.messages
    .fetch(messageId)
    .catch(() => null);

  if (!msg) continue;

  msg.attachments.forEach(att => {
    if (att.contentType?.startsWith("image/")) {
      files.push({
        attachment: att.url,
        name: att.name || "image.png"
      });
    }
  });
}

  if (hasMessageIds && files.length === 0) {
  return interaction.editReply(
    "❌ Girilen mesaj ID'lerinden görsel alınamadı."
  );
}


  if (!files.length && !text) {
    return interaction.editReply("❌ Gönderilecek metin veya görsel bulunamadı.");
  }

  await targetChannel.send({
    content: text || null,
    files: files.length ? files : undefined
  });

  await interaction.editReply("✅ Mesaj başarıyla gönderildi.");
});

// ----------------------------------------------------

client.login(process.env.TOKEN);