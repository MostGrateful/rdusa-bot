import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const {
  TRELLO_API_KEY,
  TRELLO_TOKEN,
  TRELLO_BOARD_ID,
  TRELLO_LIST_BLACKLIST,
  LOG_CHANNEL_ID_MAIN,
  LOG_CHANNEL_ID_DEV,
} = process.env;

export default {
  data: new SlashCommandBuilder()
    .setName("backgroundcheck")
    .setDescription("Run a background check on a Roblox user and sync with Trello.")
    .addStringOption(option =>
      option
        .setName("username")
        .setDescription("Roblox username to check")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      // 🔐 Role Check
      const roleId = "1387212542245339209";
      if (!interaction.member.roles.cache.has(roleId)) {
        return await interaction.reply({
          content: "❌ Unauthorized\nYou're not authorized to use this command.",
          flags: 64,
        });
      }

      const username = interaction.options.getString("username");
      await interaction.reply({ content: `🔎 Searching Roblox profile for **${username}**...`, flags: 64 });

      // 🔍 Fetch Roblox Info
      const searchResponse = await fetch(`https://users.roblox.com/v1/usernames/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username] }),
      });
      const searchData = await searchResponse.json();
      const user = searchData.data?.[0];
      if (!user)
        return await interaction.editReply({ content: `❌ Roblox user **${username}** not found.` });

      const userId = user.id;
      const displayName = user.displayName;
      const joinResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`);
      const joinData = await joinResponse.json();
      const createdAt = new Date(joinData.created);
      const joinDate = createdAt.toLocaleDateString();

      // 📅 Account Age
      const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const isNewAccount = accountAgeDays <= 30;

      // 👥 Fetch Roblox Groups
      const groupRes = await fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
      const groupData = await groupRes.json();
      const userGroups = groupData.data?.map(g => g.group.id) || [];

      // 🗂️ Get Trello Lists
      const listsRes = await fetch(
        `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      );
      const lists = await listsRes.json();

      // 🧭 Determine Trello List Range
      const firstChar = username[0].toUpperCase();
      const listMap = {
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

      let matchedListName = "0-9";
      for (const [range, regex] of Object.entries(listMap)) {
        if (regex.test(firstChar)) {
          matchedListName = range;
          break;
        }
      }

      const targetList = lists.find(l => l.name === matchedListName);
      if (!targetList)
        return await interaction.editReply({
          content: `⚠️ Could not find a matching Trello list for **${username}** (expected list: ${matchedListName}).`,
        });

      // 🧾 Check if Card Exists
      const cardsRes = await fetch(
        `https://api.trello.com/1/lists/${targetList.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      );
      const cards = await cardsRes.json();
      const cardName = `${username} (${userId})`;
      let userCard = cards.find(c => c.name === cardName);

      const description = `**Roblox Username:** ${username}\n**Display Name:** ${displayName}\n**Roblox ID:** ${userId}\n**Join Date:** ${joinDate}`;
      if (!userCard) {
        const createCardRes = await fetch(
          `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idList: targetList.id, name: cardName, desc: description }),
          }
        );
        userCard = await createCardRes.json();
      } else {
        await fetch(
          `https://api.trello.com/1/cards/${userCard.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ desc: description }),
          }
        );
      }

      // 🚫 Check Blacklist
      const blacklistList = lists.find(l => l.name === TRELLO_LIST_BLACKLIST);
      let flaggedGroups = [];
      if (blacklistList) {
        const blacklistRes = await fetch(
          `https://api.trello.com/1/lists/${blacklistList.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
        );
        const blacklistCards = await blacklistRes.json();
        const blacklistIds = blacklistCards.map(c => parseInt(c.name)).filter(Boolean);
        flaggedGroups = userGroups.filter(gid => blacklistIds.includes(gid));
      }

      // 🚩 Collect all Trello labels
      const labelRes = await fetch(
        `https://api.trello.com/1/cards/${userCard.id}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      );
      const existingLabels = await labelRes.json();
      let flagList = existingLabels.map(l => l.name);
      let hasFlag = flagList.length > 0;

      // ⚠️ Create "Account <30" Label if new
      if (isNewAccount) {
        const labelsRes = await fetch(
          `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
        );
        const labels = await labelsRes.json();
        let label = labels.find(l => l.name === "Account <30");
        if (!label) {
          const labelRes = await fetch(
            `https://api.trello.com/1/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                idBoard: TRELLO_BOARD_ID,
                name: "Account <30",
                color: "yellow",
              }),
            }
          );
          label = await labelRes.json();
        }
        await fetch(
          `https://api.trello.com/1/cards/${userCard.id}/idLabels?value=${label.id}&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          { method: "POST" }
        );
        flagList.push("Account <30");
        hasFlag = true;
      }

      // 🚩 Add Flagged Label if in Blacklisted Groups
      if (flaggedGroups.length > 0) {
        const labelsRes = await fetch(
          `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
        );
        const labels = await labelsRes.json();
        const flaggedLabel =
          labels.find(l => l.name === "Flagged") ||
          (await (
            await fetch(
              `https://api.trello.com/1/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  idBoard: TRELLO_BOARD_ID,
                  name: "Flagged",
                  color: "red",
                }),
              }
            )
          ).json());
        await fetch(
          `https://api.trello.com/1/cards/${userCard.id}/idLabels?value=${flaggedLabel.id}&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          { method: "POST" }
        );
        flagList.push("Flagged (Blacklisted Group)");
        hasFlag = true;
      }

      // 🗒️ Comment with results
      const resultsSummary = hasFlag
        ? flagList.join(", ")
        : "✅ No flags found";

      await fetch(
        `https://api.trello.com/1/cards/${userCard.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `✅ Background Check Run\nChecked by: ${interaction.user.username}\nDate: ${new Date().toUTCString()}\nResults: ${resultsSummary}`,
          }),
        }
      );

      // 🧾 Result Embed
      const resultEmbed = new EmbedBuilder()
        .setTitle(`${username} (${userId})`)
        .setColor(hasFlag ? 0xED4245 : 0x57F287)
        .addFields(
          { name: "Roblox Username", value: username, inline: true },
          { name: "Display Name", value: displayName, inline: true },
          { name: "Roblox ID", value: String(userId), inline: true },
          { name: "Join Date", value: joinDate, inline: true },
          { name: "Account Age", value: `${accountAgeDays} days`, inline: true },
          {
            name: "Flags Detected",
            value: hasFlag ? `🚩 ${flagList.join("\n🚩 ")}` : "✅ None",
            inline: false,
          },
          {
            name: "Blacklisted Groups",
            value: flaggedGroups.length > 0 ? flaggedGroups.join(", ") : "✅ None Found",
            inline: false,
          },
          { name: "Trello Card", value: `[View on Trello](${userCard.url})`, inline: false }
        )
        .setFooter({ text: "RDUSA Background Check System" })
        .setTimestamp();

      await interaction.editReply({ content: "", embeds: [resultEmbed] });

    } catch (err) {
      console.error(err);
      await interaction.editReply({
        content: "❌ An error occurred while running the background check.",
      });
    }
  },
};
