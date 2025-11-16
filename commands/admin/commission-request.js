import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const { TRELLO_API_KEY, TRELLO_TOKEN } = process.env;
const TRELLO_BOARD_ID = "DK6WJt1g";
const LOG_CHANNEL_ID = "1389010246030069820";

const APPROVED_ROLES = [
  "1332198216560541696",
  "1378460548844486776",
  "1389056453486051439",
  "1332198329899286633",
  "1332198334135275620",
  "1332198337977389088",
  "1332198340288577589",
  "1332200411586887760",
  "1332198672720723988",
  "1347449287046336563",
  "1347451565623218206",
  "1347451569372926022",
  "1347717557674573865",
  "1347721442392805396",
  "1347452419230928897",
  "1347452417595277404",
];

// Helper: pick Trello list alphabetically
function getAlphaList(username) {
  const first = (username?.[0] || "").toUpperCase();
  const map = {
    "A-C": /[A-C]/, "D-F": /[D-F]/, "G-I": /[G-I]/,
    "J-L": /[J-L]/, "M-O": /[M-O]/, "P-R": /[P-R]/,
    "S-U": /[S-U]/, "V-Z": /[V-Z]/,
  };
  for (const [n, r] of Object.entries(map)) if (r.test(first)) return n;
  return "A-C";
}

async function safeReply(i, payload) {
  try {
    if (!i.replied && !i.deferred) return await i.reply(payload);
    return await i.followUp(payload);
  } catch (_) {}
}

export default {
  data: new SlashCommandBuilder()
    .setName("commission-request")
    .setDescription("Submit a commission request for review.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true))
    .addStringOption(o => o.setName("oldrank").setDescription("Old rank").setRequired(true))
    .addStringOption(o => o.setName("newrank").setDescription("New rank").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for commission").setRequired(true))
    .addUserOption(o => o.setName("ping").setDescription("User to ping").setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    const username = interaction.options.getString("username");
    const oldrank = interaction.options.getString("oldrank");
    const newrank = interaction.options.getString("newrank");
    const reason = interaction.options.getString("reason");
    const ping = interaction.options.getUser("ping");

    if (ping.id === interaction.user.id)
      return interaction.editReply("🚫 You cannot submit a commission request for yourself.");

    try {
      // Validate Roblox user
      const lookup = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username] }),
      }).then(r => r.json());
      const rb = lookup?.data?.[0];
      if (!rb) return interaction.editReply(`❌ Roblox user **${username}** not found.`);
      const userId = rb.id;
      const displayName = rb.displayName;
      const joinDate = new Date((await fetch(`https://users.roblox.com/v1/users/${userId}`).then(r => r.json())).created).toLocaleDateString();

      // Base Embed
      const embed = new EmbedBuilder()
        .setColor(0x43b581)
        .setTitle("📗 Commission Request")
        .setDescription(`**Username:** ${username}\n**Old Rank:** ${oldrank}\n**New Rank:** ${newrank}\n**Reason:** ${reason}\n**Ping:** ${ping}\n\n**Display Name:** ${displayName}\n**Join Date:** ${joinDate}`)
        .setFooter({ text: `Logged by ${interaction.user.tag}` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("commission_accept").setLabel("Approve").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("commission_deny").setLabel("Deny").setStyle(ButtonStyle.Danger)
      );

      const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID);
      const sentMsg = await logChannel.send({ content: `${ping}`, embeds: [embed], components: [row] });

      // Trello list & card
      const listName = getAlphaList(username);
      const lists = await fetch(`https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`).then(r => r.json());
      const targetList = lists.find(l => l.name.toUpperCase() === listName.toUpperCase());
      if (!targetList) throw new Error(`Trello list ${listName} not found`);

      const cards = await fetch(`https://api.trello.com/1/lists/${targetList.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`).then(r => r.json());
      const cardName = `${username} (${userId})`;
      let card = cards.find(c => c.name.toLowerCase() === cardName.toLowerCase());

      if (!card) {
        card = await fetch(`https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idList: targetList.id,
            name: cardName,
            desc: `**Roblox Username:** ${username}\n**Display Name:** ${displayName}\n**Roblox ID:** ${userId}\n**Join Date:** ${joinDate}`,
          }),
        }).then(r => r.json());
      }

      // Add initial comment
      await fetch(`https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text:
            `📝 **Commission Request**\nSubmitted by: ${interaction.user.tag}\nOld Rank: ${oldrank}\nNew Rank: ${newrank}\nReason: ${reason}\nStatus: Pending Review\n[Discord Link](https://discord.com/channels/${interaction.guild.id}/${logChannel.id}/${sentMsg.id})`,
        }),
      });

      await interaction.editReply(`✅ Commission request logged to Trello under **${listName}**.`);

      // Buttons
      const collector = sentMsg.createMessageComponentCollector({ time: 60 * 60 * 1000 });
      collector.on("collect", async i => {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        if (!member?.roles.cache.some(r => APPROVED_ROLES.includes(r.id)))
          return safeReply(i, { content: "🚫 You are not authorized to manage this request.", flags: 64 });

        // APPROVE
        if (i.customId === "commission_accept") {
          await i.deferUpdate().catch(() => {});
          const approved = EmbedBuilder.from(embed)
            .setColor(0x57f287)
            .setDescription(`**Username:** ${username}\n**Old Rank:** ${oldrank}\n**New Rank:** ${newrank}\n**Reason:** ${reason}\n**Ping:** ${ping}\n\n✅ **Approved by ${i.user.tag}**`)
            .setFooter({ text: `Approved • ${new Date().toLocaleString()}` });
          await sentMsg.edit({ embeds: [approved], components: [] }).catch(() => {});

          // ✅ Post a new update comment (not edit)
          await fetch(`https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `✅ **Approved by ${i.user.tag}**\nUser: ${username}\nRank: ${oldrank} → ${newrank}\nDate: ${new Date().toUTCString()}`,
            }),
          }).catch(() => {});
        }

        // DENY
        if (i.customId === "commission_deny") {
          await safeReply(i, { content: "✏️ Reply with reason (60s).", flags: 64 });
          const filter = m => m.author.id === i.user.id;
          const collected = await i.channel.awaitMessages({ filter, max: 1, time: 60_000 }).catch(() => null);
          if (!collected?.size)
            return safeReply(i, { content: "❌ No reason given. Cancelled.", flags: 64 });
          const reasonText = collected.first().content;
          await collected.first().delete().catch(() => {});

          const denied = EmbedBuilder.from(embed)
            .setColor(0xed4245)
            .setDescription(`**Username:** ${username}\n**Old Rank:** ${oldrank}\n**New Rank:** ${newrank}\n**Reason:** ${reason}\n**Ping:** ${ping}\n\n❌ **Denied by ${i.user.tag}**\n**Reason:** ${reasonText}`)
            .setFooter({ text: `Denied • ${new Date().toLocaleString()}` });
          await sentMsg.edit({ embeds: [denied], components: [] }).catch(() => {});

          // ❌ Post denial update comment
          await fetch(`https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `❌ **Denied by ${i.user.tag}**\nReason: ${reasonText}\nUser: ${username}\nRank: ${oldrank} → ${newrank}\nDate: ${new Date().toUTCString()}`,
            }),
          }).catch(() => {});
        }
      });

      collector.on("end", async () => {
        await sentMsg.edit({
          embeds: [
            EmbedBuilder.from(embed)
              .setColor(0x808080)
              .setFooter({ text: `Review period expired • ${new Date().toLocaleString()}` }),
          ],
          components: [],
        }).catch(() => {});
      });
    } catch (err) {
      console.error("❌ Error in /commission-request:", err);
      await interaction.editReply("❌ An error occurred while processing this request.");
    }
  },
};
