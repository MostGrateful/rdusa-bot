import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { trelloFetch } from "../../utils/trelloFetch.js";
import dotenv from "dotenv";
dotenv.config();

const { TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID } = process.env;

export default {
  data: new SlashCommandBuilder()
    .setName("discharge-log")
    .setDescription("Log a Discharge event to Discord and Trello.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true))
    .addStringOption(o => o.setName("rank").setDescription("Rank at discharge").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for discharge").setRequired(true))
    .addStringOption(o =>
      o
        .setName("type")
        .setDescription("Discharge type")
        .addChoices(
          { name: "Honorable", value: "Honorable" },
          { name: "General", value: "General" },
          { name: "Dishonorable", value: "Dishonorable" }
        )
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.reply({ content: "🗂️ Logging Discharge...", flags: 64 });

    const username = interaction.options.getString("username");
    const rank = interaction.options.getString("rank");
    const reason = interaction.options.getString("reason");
    const type = interaction.options.getString("type");

    try {
      // --- Roblox Lookup ---
      const res = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username] }),
      });
      const data = await res.json();
      const user = data?.data?.[0];
      if (!user)
        return interaction.editReply({ content: `❌ Roblox user **${username}** not found.` });

      const userId = user.id;
      const displayName = user.displayName;
      const profile = await fetch(`https://users.roblox.com/v1/users/${userId}`).then(r => r.json());
      const joinDate = new Date(profile.created).toLocaleDateString();

      // --- Discord Embed ---
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("📕 Discharge Log")
        .setDescription(
          `**Username:** ${username}\n**Rank:** ${rank}\n**Reason:** ${reason}\n**Type:** ${type}`
        )
        .addFields(
          { name: "Display Name", value: displayName, inline: true },
          { name: "Join Date", value: joinDate, inline: true }
        )
        .setFooter({ text: `Logged by ${interaction.user.tag}` })
        .setTimestamp();

      const logChannel = await interaction.client.channels.fetch("1393687068525199520");
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
      if (!list)
        return interaction.editReply({ content: `❌ Could not find Trello list for ${listName}.` });

      // 🔍 Case-insensitive Trello card lookup
      const cards = await fetch(
        `https://api.trello.com/1/lists/${list.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      ).then(r => r.json());

      const cardName = `${username} (${userId})`;
      let card = cards.find(c => c.name.toLowerCase() === cardName.toLowerCase());

      const desc = `**Roblox Username:** ${username}\n**Display Name:** ${displayName}\n**Roblox ID:** ${userId}\n**Join Date:** ${joinDate}`;

      // --- Create new card if not found ---
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

      // --- Add Comment Log ---
      const comment = `📕 Discharge Logged\nBy: ${interaction.user.tag}\nDate: ${new Date().toUTCString()}\n**Rank:** ${rank}\n**Reason:** ${reason}\n**Type:** ${type}`;
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

      await interaction.editReply({
        content: `✅ Discharge Log for **${username}** recorded successfully.`,
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: "❌ Error logging Discharge." });
    }
  },
};
