// index.js — async-aware final sürüm
import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits, EmbedBuilder, Partials, PermissionsBitField } from "discord.js";
import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
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
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle("🏆 Tournament Leaderboard")
    .setColor(0xffd700)
    .setTimestamp()
    .setFooter({ text: new Date().toLocaleString() });

  let desc = "";

  for (let i = 0; i < 10; i++) {
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

    desc += `**${i + 1}. ${displayName}** — ${userData.total} win\n${categories}\n\n`;
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
		"**Welcome to our server! Here you'll find tournaments, conversations, and plenty of chess.**\n" +
		"(Sunucuya hoş geldin! Burada turnuvalar, sohbetler ve satranç dolu eğlence seni bekliyor.)\n\n" +
        "**Our Lichess Team:**\nhttps://lichess.org/team/bedbot\n" +
		"**Our ChessCom Team:**\nhttps://www.chess.com/club/bedbot\n\n" +	
		"**If you wish, you can customize your profile by adding your lichess and chesscom accounts to our 'verify' channel.**\n" +
		"(Dilersen 'verify' kanalımıza lichess ve chesscom hesaplarını yazarak profilini özelleştirebilirsin :alien:)" 
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
	// ---------------- AFK SİSTEMİ ----------------
const member = message.member;
if (!member) return;

/* AFK'den çıkma */
const selfAfk = getAfk(member.id);
if (selfAfk) {

  const oldNick = selfAfk.oldNick;

  if (oldNick === null || oldNick === undefined) {
    await member.setNickname(null).catch(()=>{});
  } else {
    await member.setNickname(oldNick).catch(()=>{});
  }

  removeAfk(member.id);

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("AFK mode is off.")
    .setDescription("Welcome back 👋")
    .setTimestamp();

  const m = await message.channel.send({ embeds: [embed] }).catch(()=>null);
  if (m) setTimeout(() => m.delete().catch(()=>{}), 3000);
}


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
  const afk = getAfk(userId);
  if (!afk) continue;

  const diff = Date.now() - afk.since;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const timeText =
    hrs > 0 ? `${hrs} saat ${mins % 60} dk` : `${mins} dk`;

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("User is AFK")
    .setDescription(
      `<@${userId}> is AFK rn.\n` +
      `⏱️ **Duration:** ${timeText}` +
      `${afk.note ? `\n📝 **Note:** ${afk.note}` : ""}`
    )
    .setTimestamp();

  // ⚠️ NOTLARINA UYGUN:
  // - BU mesaj SİLİNMEZ
  await message.channel.send({ embeds: [embed] }).catch(()=>{});
  break; // spam engel
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

  setAfk(message.author.id, {
    since: Date.now(),
    note,
	oldNick
  });
  
const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("AFK Mode is On")
    .setDescription(
      `You're now AFK.` +
      `${note ? `\n📝 **Not:** ${note}` : ""}`
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
        { name: "Lichess", value: profile.lichess && profile.lichess.username ? `Kullanıcı: **${profile.lichess.username}**\nBullet: ${profile.lichess.bullet ?? "-"}\nBlitz: ${profile.lichess.blitz ?? "-"}\nRapid: ${profile.lichess.rapid ?? "-"}\nClassical: ${profile.lichess.classic ?? "-"}` : "-", inline: true },
        { name: "Chess.com", value: profile.chesscom && profile.chesscom.username ? `Kullanıcı: **${profile.chesscom.username}**\nBullet: ${profile.chesscom.bullet ?? "-"}\nBlitz: ${profile.chesscom.blitz ?? "-"}\nRapid: ${profile.chesscom.rapid ?? "-"}\nClassical: ${profile.chesscom.classic ?? "-"}` : "-", inline: true },
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
        .slice(0,10);

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

    // ADMIN KONTROLÜ
    if (!interaction.memberPermissions?.has("Administrator")) {
      return interaction.reply({
        content: "❌ Bu komutu sadece yöneticiler kullanabilir.",
        ephemeral: true
      });
    }

    const channelSelect = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("send_select_channel")
        .setPlaceholder("Mesaj göndermek için kanal seç")
        .addChannelTypes(0) // 0 = GUILD_TEXT
    );

    await interaction.reply({
      content: "Göndermek istediğin kanalı seç:",
      components: [channelSelect],
      ephemeral: true
    });
  }
});


// -----------------------------------------
// Kanal seçildikten sonra mesaj türü seçimi
// -----------------------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChannelSelectMenu()) return;
  if (interaction.customId !== "send_select_channel") return;

  const selectedChannel = interaction.values[0];

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`send_text_${selectedChannel}`)
      .setLabel("Düz Metin")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`send_embed_${selectedChannel}`)
      .setLabel("Embed")
      .setStyle(ButtonStyle.Success)
  );

  await interaction.update({
    content: `Seçilen kanal: <#${selectedChannel}>\nGönderim türünü seç:`,
    components: [buttons]
  });
});

// -----------------------------------------
// Düz metin gönderme
// -----------------------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("send_text_")) return;

  const channelId = interaction.customId.replace("send_text_", "");

  const modal = new ModalBuilder()
    .setCustomId(`send_text_modal_${channelId}`)
    .setTitle("Düz Metin Gönder");

  const input = new TextInputBuilder()
    .setCustomId("send_text_content")
    .setLabel("Gönderilecek mesaj")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  await interaction.showModal(modal);
});

// Modal sonucu
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("send_text_modal_")) return;

  const channelId = interaction.customId.replace("send_text_modal_", "");
  const channel = await interaction.guild.channels.fetch(channelId);

  const content = interaction.fields.getTextInputValue("send_text_content");

  await channel.send(content);

  await interaction.reply({
    content: "Mesaj gönderildi!",
    ephemeral: true
  });
});

// -----------------------------------------
// Embed gönderme
// -----------------------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("send_embed_")) return;

  const channelId = interaction.customId.replace("send_embed_", "");

  const modal = new ModalBuilder()
    .setCustomId(`send_embed_modal_${channelId}`)
    .setTitle("Embed Oluştur");

  const title = new TextInputBuilder()
    .setCustomId("embed_title")
    .setLabel("Başlık")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const desc = new TextInputBuilder()
    .setCustomId("embed_description")
    .setLabel("İçerik")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(desc)
  );

  await interaction.showModal(modal);
});

// Embed modal sonucu
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("send_embed_modal_")) return;

  const channelId = interaction.customId.replace("send_embed_modal_", "");
  const channel = await interaction.guild.channels.fetch(channelId);

  const title = interaction.fields.getTextInputValue("embed_title");
  const desc = interaction.fields.getTextInputValue("embed_description");

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setColor(0x0099ff);

  await channel.send({ embeds: [embed] });

  await interaction.reply({
    content: "Embed gönderildi!",
    ephemeral: true
  });
});

// ----------------------------------------------------

client.login(process.env.TOKEN);

