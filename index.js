// index.js — final sürüm (güncellenmiş: addwin announce + profile anlık güncelleme)
import { Client, GatewayIntentBits, EmbedBuilder, Partials, PermissionsBitField } from "discord.js";
import dotenv from "dotenv";
import {
  getProfile,
  loadProfiles,
  saveProfiles,
  setAboutMe
} from "./profileDB.js";
import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
dotenv.config();

const PREFIX = ".";
const WINNER_ROLE_ID = "1445571202050424933";
const ANNOUNCE_CHANNEL_ID = "1381653080885694597"; // tebrik mesajı gidecek kanal

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

// ----------------------------------------------------
// HOŞ GELDİN DM
// ----------------------------------------------------
client.on("guildMemberAdd", async (member) => {
  try {
    getProfile(member.id);

    const embed = new EmbedBuilder()
      .setTitle("Selam! 👋")
      .setColor(0x00ff00)
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(
        "Sunucuya hoş geldin! Burada turnuvalar, sohbetler ve satranç dolu eğlence seni bekliyor.\n\n" +
          "**Lichess takımımız:**\nhttps://lichess.org/team/bedbot\n\n" +
          //"**Chess.com takımımız:**\nhttps://lichess.org/team/bedbot\n\n" + 
		  "**Dilersen 'verify' kanalımıza lichess ve chesscom hesaplarını yazarak profilini özelleştirebilirsin :alien:**"
      )
      .setFooter({ text: new Date().toLocaleString() })
      .setTimestamp();

    await member.send({ embeds: [embed] });
  } catch (err) {
    console.log("DM gönderilemedi:", err);
  }
});

// ----------------------------------------------------
// HELPER: fetch with basic error handling (uses global fetch)
async function safeFetchJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

// ----------------------------------------------------
// MESAJ KOMUTLARI
// ----------------------------------------------------
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const guild = message.guild;

    if (!guild) return;

    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    const requireAdmin = () => {
      if (!isAdmin) {
        message.reply("Bu komutu kullanmak için gerekli izinlere sahip değilsin.");
        return false;
      }
      return true;
    };

    // ----------------------------------------------------
    // .setaboutme
    // ----------------------------------------------------
    if (cmd === "setaboutme") {
      const text = args.join(" ").trim();
      if (!text) return message.reply("Bir şeyler yazman lazım.");
      if (text.length > 256) return message.reply("Hakkında metni 256 karakterden uzun olamaz.");

      setAboutMe(message.author.id, text);
      return message.reply("Hakkında kısmın güncellendi!");
    }

    // ----------------------------------------------------
    // .removeaboutme
    // ----------------------------------------------------
    if (cmd === "removeaboutme") {
      const profile = getProfile(message.author.id);
      profile.aboutMe = "";
      saveProfiles();

      return message.reply("Hakkında kısmın kaldırıldı.");
    }

    // ----------------------------------------------------
    // .profile  — anlık rating güncelleme (eğer bağlanmışsa)
    // ----------------------------------------------------
    if (cmd === "profile") {
      const user = message.mentions.users.first() || message.author;
      const profile = getProfile(user.id) || {};
      const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(()=>null);

      // --- anlık Lichess çek (sadece profile.lichess.username varsa) ---
      if (profile.lichess && profile.lichess.username) {
        const lichData = await safeFetchJson(`https://lichess.org/api/user/${encodeURIComponent(profile.lichess.username)}`);
        if (lichData && lichData.perfs) {
          profile.lichess.bullet = lichData.perfs?.bullet?.rating ?? profile.lichess.bullet ?? "-";
          profile.lichess.blitz  = lichData.perfs?.blitz?.rating ?? profile.lichess.blitz ?? "-";
          profile.lichess.rapid  = lichData.perfs?.rapid?.rating ?? profile.lichess.rapid ?? "-";
          profile.lichess.classic= lichData.perfs?.classical?.rating ?? profile.lichess.classic ?? "-";
          // kaydet: kullanıcı profile verisi güncellensin (isteğe bağlı)
          saveProfiles();
        }
      }

      // --- anlık Chess.com çek (sadece profile.chesscom.username varsa) ---
      if (profile.chesscom && profile.chesscom.username) {
        const chessData = await safeFetchJson(`https://api.chess.com/pub/player/${encodeURIComponent(profile.chesscom.username)}/stats`);
        if (chessData) {
          profile.chesscom.bullet  = chessData.chess_bullet?.last?.rating ?? profile.chesscom.bullet ?? "-";
          profile.chesscom.blitz   = chessData.chess_blitz?.last?.rating ?? profile.chesscom.blitz ?? "-";
          profile.chesscom.rapid   = chessData.chess_rapid?.last?.rating ?? profile.chesscom.rapid ?? "-";
          profile.chesscom.classic = chessData.chess_daily?.last?.rating ?? profile.chesscom.classic ?? "-";
          saveProfiles();
        }
      }

      // build embed
      const embed = new EmbedBuilder()
        .setTitle(`${user.username}`)
        .setColor(0x0099ff)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: new Date().toLocaleString() })
        .setTimestamp();

      if (profile.aboutMe && profile.aboutMe.trim() !== "") {
        embed.setDescription(`***${profile.aboutMe}***`);
      }

      const totalWins =
        profile.wins && Object.keys(profile.wins).length
          ? Object.values(profile.wins).reduce((a, b) => a + b, 0)
          : 0;

      embed.addFields(
        {
          name: "📅 Sunucuya Katılım",
          value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : "Bilinmiyor",
          inline: false
        },
        {
          name: "Lichess",
          value:
            profile.lichess && profile.lichess.username
              ? `Kullanıcı: **${profile.lichess.username}**\nBullet: ${profile.lichess.bullet ?? "-"}\nBlitz: ${profile.lichess.blitz ?? "-"}\nRapid: ${profile.lichess.rapid ?? "-"}\nClassical: ${profile.lichess.classic ?? "-"}`
              : "-",
          inline: true
        },
        {
          name: "Chess.com",
          value:
            profile.chesscom && profile.chesscom.username
              ? `Kullanıcı: **${profile.chesscom.username}**\nBullet: ${profile.chesscom.bullet ?? "-"}\nBlitz: ${profile.chesscom.blitz ?? "-"}\nRapid: ${profile.chesscom.rapid ?? "-"}\nClassical: ${profile.chesscom.classic ?? "-"}`
              : "-",
          inline: true
        },
        {
          name: "🏆 TOPLAM TURNUVA KAZANIMI",
          value: `**${totalWins}**`,
          inline: false
        },
        {
          name: "🏆 Turnuva Kazanımları",
          value:
            profile.wins && Object.keys(profile.wins).length
              ? Object.entries(profile.wins).map(([k, v]) => `• ${k}: ${v}`).join("\n")
              : "-",
          inline: false
        }
      );

      return message.channel.send({ embeds: [embed] });
    }

    // ----------------------------------------------------
    // .linklichess (admin) — admin başkaları adına da bağlayabilir
    // usage: .linklichess @user username  OR  .linklichess username
    // ----------------------------------------------------
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
      saveProfiles();

      return message.reply(`Lichess hesabı bağlandı: **${username}**`);
    }

    // ----------------------------------------------------
    // .unlinklichess (admin)
    // ----------------------------------------------------
    if (cmd === "unlinklichess") {
      if (!requireAdmin()) return;

      const member = message.mentions.members.first();
      const target = member ? member.id : message.author.id;

      const profile = getProfile(target);
      profile.lichess = null;
      saveProfiles();

      return message.reply("Lichess bağlantısı kaldırıldı.");
    }

    // ----------------------------------------------------
    // .linkchesscom (admin)
    // ----------------------------------------------------
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
      saveProfiles();

      return message.reply(`Chess.com hesabı bağlandı: **${username}**`);
    }

    // ----------------------------------------------------
    // .unlinkchesscom (admin)
    // ----------------------------------------------------
    if (cmd === "unlinkchesscom") {
      if (!requireAdmin()) return;

      const member = message.mentions.members.first();
      const target = member ? member.id : message.author.id;

      const profile = getProfile(target);
      profile.chesscom = null;
      saveProfiles();

      return message.reply("Chess.com bağlantısı kaldırıldı.");
    }

    // ----------------------------------------------------
    // .addwin (admin) — rol atama + tebrik embed kanala
    // usage: .addwin @user category
    // ----------------------------------------------------
    if (cmd === "addwin") {
      if (!requireAdmin()) return;

      const member = message.mentions.members.first();
      if (!member) return message.reply("Bir kullanıcı etiketlemen lazım.");

      const category = args.slice(1).join(" ").trim();
      if (!category) return message.reply("Kategori yazmadın.");

      const profile = getProfile(member.id);
      if (!profile.wins) profile.wins = {};
      profile.wins[category] = (profile.wins[category] || 0) + 1;
      saveProfiles();

      // rol atama: önce mevcut sahibinden al, sonra ekle
      const role = guild.roles.cache.get(WINNER_ROLE_ID);
      if (role) {
        try {
          for (const [, m] of role.members) {
            await m.roles.remove(role).catch(()=>{});
          }
          await member.roles.add(role).catch(()=>{});
        } catch (e) {
          console.error("Rol yönetimi hatası:", e);
        }
      }

      // tebrik embed gönder
      try {
        const announceChannel = await guild.channels.fetch(ANNOUNCE_CHANNEL_ID).catch(()=>null);
        if (announceChannel && announceChannel.isTextBased()) {
          const congrEmbed = new EmbedBuilder()
            .setTitle("🎉 Tebrikler!")
            .setDescription(`**${member.user.username}** adlı oyuncu **${category}** kategorisinde turnuva kazandı!`)
            .addFields(
              { name: "Verilen Rol", value: role ? `<@&${role.id}>` : "Rol tanımlı değil", inline: true },
              { name: "Kullanıcı", value: `${member.user.tag}`, inline: true }
            )
            .setColor(0x00ff00)
            .setFooter({ text: new Date().toLocaleString() })
            .setTimestamp();

          await announceChannel.send({ embeds: [congrEmbed] }).catch(()=>{});
        }
      } catch (e) {
        console.error("Tebrik mesajı gönderilemedi:", e);
      }

      return message.reply(`${member.user.username} → ${category} kategorisine 1 win eklendi!`);
    }

    // ----------------------------------------------------
    // .removewin (admin)
    // ----------------------------------------------------
    if (cmd === "removewin") {
      if (!requireAdmin()) return;

      const member = message.mentions.members.first();
      if (!member) return message.reply("Bir kullanıcı etiketlemen lazım.");

      const category = args.slice(1).join(" ");
      if (!category) return message.reply("Bir kategori yazmalısın.");

      const profile = getProfile(member.id);
      if (!profile.wins || !profile.wins[category]) {
        return message.reply("Bu kategoride win yok.");
      }

      profile.wins[category]--;
      if (profile.wins[category] <= 0) delete profile.wins[category];
      saveProfiles();

      return message.reply(`${member.user.username} → ${category} win kaldırıldı`);
    }

    // ----------------------------------------------------
    // .leaderboard (değişmedi: mevcut sistem korunuyor)
    // ----------------------------------------------------
    if (cmd === "leaderboard") {
      const profiles = loadProfiles();

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
        .setFooter({ text: new Date().toLocaleString() })
        .setTimestamp();

      const txt =
        arr.length && arr.some((x) => x.total > 0)
          ? arr
              .map((u, i) => {
                const m = guild.members.cache.get(u.id);
                const name = m ? m.user.username : `Unknown (${u.id})`;
                const winTxt = Object.entries(u.wins)
                  .map(([k, v]) => `• ${k}: ${v}`)
                  .join("\n");

                return `**${i + 1}. ${name}** — ${u.total} win\n${winTxt}`;
              })
              .join("\n\n")
          : "-";

      embed.setDescription(txt);

      // Leaderboard sadece komutu atan görecek (mevcut davranış korunuyor)
      return message.author.send({ embeds: [embed] }).catch(() => {
        message.reply("DM gönderilemedi.");
      });
    }
	  
  // -----------------------------------------
  // /send komutu
  // -----------------------------------------
  if (interaction.commandName === "send") {
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

  } catch (err) {
    console.error("Hata:", err);
    try {
      await message.reply("Bir hata oluştu, loglar kontrol ediliyor.");
    } catch {}
  }
});

// ----------------------------------------------------
client.once("ready", () => {
  console.log(`Bot aktif → ${client.user.tag}`);
  client.application.commands.set([
  {
    name: "ping",
    description: "Botun gecikmesini ölçer."
  },
  {
    name: "send",
    description: "Belirtilen kanala mesaj gönder"
  }
]);

});

client.login(process.env.TOKEN);
