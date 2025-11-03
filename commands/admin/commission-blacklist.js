import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const { TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID, DEV_LOG_CHANNEL_ID } = process.env;

export default {
  data: new SlashCommandBuilder()
    .setName("commission-blacklist")
    .setDescription("Log a Commission Blacklist to Discord and Trello.")
    .addStringOption(o =>
      o.setName("username").setDescription("Roblox username").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason for blacklist").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("length")
        .setDescription("Length: 7D, 2W, 6M, 1Y, or PERM for permanent.")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("approvedby").setDescription("Name of approver").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.reply({ content: "🗂️ Processing blacklist...", flags: 64 });

    const username = interaction.options.getString("username");
    const reason = interaction.options.getString("reason");
    const length = interaction.options.getString("length");
    const approvedby = interaction.options.getString("approvedby");

    try {
      // --- Roblox Lookup ---
      const roblox = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username] }),
      }).then(r => r.json());

      const user = roblox?.data?.[0];
      if (!user)
        return interaction.editReply({ content: `❌ Roblox user **${username}** not found.` });

      const userId = user.id;
      const displayName = user.displayName;
      const profile = await fetch(`https://users.roblox.com/v1/users/${userId}`).then(r => r.json());
      const joinDate = new Date(profile.created).toLocaleDateString();

      // --- Determine Due Date ---
      let dueDate = null;
      let readableDuration = length.toUpperCase().trim();
      const len = readableDuration;
      const match = len.match(/(\d+)\s*(D|W|M|Y)/i);

      if (len === "PERM" || len === "PERMANENT") {
        dueDate = "9999-12-31T23:59:59.000Z";
        readableDuration = "Permanent";
      } else if (match) {
        const amount = parseInt(match[1]);
        const unit = match[2].toUpperCase();
        const now = new Date();

        switch (unit) {
          case "D":
            now.setDate(now.getDate() + amount);
            readableDuration = `${amount} Day(s)`;
            break;
          case "W":
            now.setDate(now.getDate() + amount * 7);
            readableDuration = `${amount} Week(s)`;
            break;
          case "M":
            now.setMonth(now.getMonth() + amount);
            readableDuration = `${amount} Month(s)`;
            break;
          case "Y":
            now.setFullYear(now.getFullYear() + amount);
            readableDuration = `${amount} Year(s)`;
            break;
        }

        dueDate = now.toISOString();
      } else {
        // default = 7 days
        const now = new Date();
        now.setDate(now.getDate() + 7);
        dueDate = now.toISOString();
        readableDuration = "7D (default)";
      }

      // --- Embed ---
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("📕 Commission Blacklist")
        .setDescription(
          `**Username:** ${username}\n**Roblox ID:** ${userId}\n**Reason:** ${reason}\n**Length:** ${readableDuration}\n**Approved by:** ${approvedby}`
        )
        .addFields(
          { name: "Display Name", value: displayName, inline: true },
          { name: "Join Date", value: joinDate, inline: true }
        )
        .setFooter({ text: `Logged by ${interaction.user.tag}` })
        .setTimestamp();

      const logChannel = await interaction.client.channels.fetch("1389010219673321677");
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

      const cards = await fetch(
        `https://api.trello.com/1/lists/${list.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      ).then(r => r.json());

      const cardName = `${username} (${userId})`;
      let card = cards.find(c => c.name.toLowerCase() === cardName.toLowerCase());

      const desc = `**Roblox Username:** ${username}\n**Display Name:** ${displayName}\n**Roblox ID:** ${userId}\n**Join Date:** ${joinDate}`;

      if (!card) {
        const res = await fetch(
          `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idList: list.id,
              name: cardName,
              desc,
              due: dueDate,
              dueComplete: false,
            }),
          }
        );
        card = await res.json();
      } else {
        await fetch(
          `https://api.trello.com/1/cards/${card.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ due: dueDate, dueComplete: false }),
          }
        );
      }

      const trelloComment = `✅ Commission Blacklist Logged\nChecked by: ${interaction.user.tag}\nDate: ${new Date().toUTCString()}\n**Reason:** ${reason}\n**Expires:** ${readableDuration}`;
      await fetch(
        `https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `${trelloComment}\n\n[View Discord Log](https://discord.com/channels/${interaction.guild.id}/${logChannel.id}/${sentMsg.id})`,
          }),
        }
      );

      const labels = await fetch(
        `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      ).then(r => r.json());

      let label = labels.find(l => l.name === "Commission Blacklist");
      if (!label) {
        const res = await fetch(
          `https://api.trello.com/1/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idBoard: TRELLO_BOARD_ID,
              name: "Commission Blacklist",
              color: "red",
            }),
          }
        );
        label = await res.json();
      }

      await fetch(
        `https://api.trello.com/1/cards/${card.id}/idLabels?value=${label.id}&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
        { method: "POST" }
      );

      await interaction.editReply({
        content: `✅ Commission Blacklist for **${username}** logged successfully. (Expires: ${readableDuration})`,
      });

      const devLog = await interaction.client.channels.fetch(DEV_LOG_CHANNEL_ID).catch(() => null);
      if (devLog) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("🕓 Trello Due Date Applied")
          .setDescription(`Set due date for **${username} (${userId})** → ${dueDate}`)
          .setFooter({ text: "Commission Blacklist System" })
          .setTimestamp();
        await devLog.send({ embeds: [logEmbed] });
      }
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: "❌ Error processing Commission Blacklist." });
    }
  },
};
