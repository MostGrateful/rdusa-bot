import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const { TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID } = process.env;

export default {
  data: new SlashCommandBuilder()
    .setName("ranking-log")
    .setDescription("Log a Ranking change to Discord and Trello.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true))
    .addStringOption(o => o.setName("oldrank").setDescription("Old Rank").setRequired(true))
    .addStringOption(o => o.setName("newrank").setDescription("New Rank").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for rank change").setRequired(true)),

  async execute(interaction) {
    await interaction.reply({ content: "🗂️ Logging Ranking Change...", flags: 64 });
    const username = interaction.options.getString("username");
    const oldrank = interaction.options.getString("oldrank");
    const newrank = interaction.options.getString("newrank");
    const reason = interaction.options.getString("reason");

    try {
      // Roblox lookup
      const res = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username] }),
      });
      const data = await res.json();
      const user = data?.data?.[0];
      if (!user) return interaction.editReply({ content: `❌ Roblox user **${username}** not found.` });
      const userId = user.id;
      const displayName = user.displayName;
      const profile = await fetch(`https://users.roblox.com/v1/users/${userId}`).then(r => r.json());
      const joinDate = new Date(profile.created).toLocaleDateString();

      const embed = new EmbedBuilder()
        .setColor(0x43b581)
        .setTitle("📘 Ranking Log")
        .setDescription(
          `**Username:** ${username}\n**Old Rank:** ${oldrank}\n**New Rank:** ${newrank}\n**Reason:** ${reason}`
        )
        .addFields(
          { name: "Display Name", value: displayName, inline: true },
          { name: "Join Date", value: joinDate, inline: true }
        )
        .setFooter({ text: `Logged by ${interaction.user.tag}` })
        .setTimestamp();

      const logChannel = await interaction.client.channels.fetch("1389010276820717618");
      const sentMsg = await logChannel.send({ embeds: [embed] });

      // --- Trello ---
      const lists = await fetch(
        `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      ).then(r => r.json());

      const firstChar = username[0].toUpperCase();
      const ranges = {
        "0-9": /^[0-9]/,
        "A-C": /^[A-C]/,
        "D-F": /^[D-F]/,
        "G-I": /^[G-I]/,
        "J-L": /^[J-L]/,
        "M-O": /^[M-O]/,
        "P-R": /^[P-R]/,
        "S-U": /^[S-U]/,
        "V-Z": /^[V-Z]/,
      };
      let listName = "0-9";
      for (const [range, regex] of Object.entries(ranges))
        if (regex.test(firstChar)) listName = range;
      const list = lists.find(l => l.name === listName);

      const cards = await fetch(
        `https://api.trello.com/1/lists/${list.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      ).then(r => r.json());
      const cardName = `${username} (${userId})`;
      let card = cards.find(c => c.name === cardName);

      const desc = `**Roblox Username:** ${username}\n**Display Name:** ${displayName}\n**Roblox ID:** ${userId}\n**Join Date:** ${joinDate}`;
      if (!card) {
        const res = await fetch(
          `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idList: list.id, name: cardName, desc }),
          }
        );
        card = await res.json();
      }

      const comment = `📘 Ranking Change Logged\nBy: ${interaction.user.tag}\nDate: ${new Date().toUTCString()}\n**Old Rank:** ${oldrank}\n**New Rank:** ${newrank}\n**Reason:** ${reason}`;
      await fetch(
        `https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `${comment}\n\n[View Discord Log](https://discord.com/channels/${interaction.guild.id}/${logChannel.id}/${sentMsg.id})`,
          }),
        }
      );

      await interaction.editReply({ content: `✅ Ranking log for **${username}** recorded.` });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: "❌ Error logging Ranking Change." });
    }
  },
};
