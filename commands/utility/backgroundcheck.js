import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const {
  TRELLO_API_KEY,
  TRELLO_TOKEN,
  TRELLO_BOARD_SHORTLINK, // e.g. DK6WJt1g
  TRELLO_BOARD_ID,        // real board id: 60b747b8f127c90bdec5ca84
  TRELLO_LIST_BLACKLIST,  // name of blacklist list (optional)
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
      // 🔐 Role check
      const roleId = "1387212542245339209";
      if (!interaction.member.roles.cache.has(roleId)) {
        return interaction.reply({
          content: "❌ Unauthorized. You cannot use this command.",
          flags: 64,
        });
      }

      const username = interaction.options.getString("username").trim();
      await interaction.reply({
        content: `🔎 Searching Roblox profile for **${username}**...`,
        flags: 64,
      });

      // 🔍 Roblox lookup
      const lookupRes = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username] }),
      });

      const lookupData = await lookupRes.json();
      const user = lookupData.data?.[0];
      if (!user) {
        return interaction.editReply({
          content: `❌ No Roblox user found with the name **${username}**.`,
        });
      }

      const userId = user.id;
      const displayName = user.displayName;

      const profileRes = await fetch(`https://users.roblox.com/v1/users/${userId}`);
      const profileData = await profileRes.json();
      const createdAt = new Date(profileData.created);
      const joinDate = createdAt.toLocaleDateString();
      const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / 86400000);
      const isNewAccount = accountAgeDays <= 30;

      // 👥 Roblox groups (for blacklist logic)
      let userGroups = [];
      try {
        const groupRes = await fetch(
          `https://groups.roblox.com/v2/users/${userId}/groups/roles`
        );
        const groupData = await groupRes.json();
        userGroups = groupData.data?.map(g => g.group.id) || [];
      } catch (e) {
        console.error("Error fetching Roblox groups:", e);
      }

      // 🗂️ Trello lists (using board SHORTLINK)
      const listsRes = await fetch(
        `https://api.trello.com/1/boards/${TRELLO_BOARD_SHORTLINK}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      );
      const lists = await listsRes.json();

      // 🧭 Determine alphabetical bucket
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

      let matchedList = "0-9";
      for (const [range, regex] of Object.entries(ranges)) {
        if (regex.test(firstChar)) {
          matchedList = range;
          break;
        }
      }

      const targetList = lists.find(l => l.name === matchedList);
      if (!targetList) {
        return interaction.editReply({
          content: `❌ No Trello list found for **${matchedList}**.`,
        });
      }

      // 🧾 Get or create Trello card (shared naming with /flag-user)
      const cardsRes = await fetch(
        `https://api.trello.com/1/lists/${targetList.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      );
      const cards = await cardsRes.json();

      const desiredName = `${username} (${userId})`.toLowerCase();
      const plainName = username.toLowerCase();

      let userCard =
        cards.find(c => c.name && c.name.toLowerCase() === desiredName) ||
        cards.find(c => c.name && c.name.toLowerCase() === plainName);

      const description =
        `**Roblox Username:** ${username}\n` +
        `**Display Name:** ${displayName}\n` +
        `**Roblox ID:** ${userId}\n` +
        `**Join Date:** ${joinDate}`;

      if (!userCard) {
        // Create standardized card
        const createCardRes = await fetch(
          `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idList: targetList.id,
              name: `${username} (${userId})`,
              desc: description,
            }),
          }
        );
        userCard = await createCardRes.json();
      } else {
        // If it was plain username, rename to standardized
        if (userCard.name.toLowerCase() === plainName) {
          await fetch(
            `https://api.trello.com/1/cards/${userCard.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: `${username} (${userId})`, desc: description }),
            }
          );
          userCard.name = `${username} (${userId})`;
        } else {
          // Just update description
          await fetch(
            `https://api.trello.com/1/cards/${userCard.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ desc: description }),
            }
          );
        }
      }

      // 🚩 Blacklist logic (optional)
      let flaggedGroups = [];
      if (TRELLO_LIST_BLACKLIST) {
        const blacklistList = lists.find(l => l.name === TRELLO_LIST_BLACKLIST);
        if (blacklistList) {
          const blRes = await fetch(
            `https://api.trello.com/1/lists/${blacklistList.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
          );
          const blCards = await blRes.json();
          const blIds = blCards
            .map(c => parseInt(c.name, 10))
            .filter(id => !Number.isNaN(id));

          flaggedGroups = userGroups.filter(id => blIds.includes(id));

          if (flaggedGroups.length > 0) {
            // Ensure "Flagged" label exists on REAL board
            const boardLabelsRes = await fetch(
              `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
            );
            const boardLabels = await boardLabelsRes.json();

            let flaggedLabel = boardLabels.find(l => l.name === "Flagged");
            if (!flaggedLabel) {
              const createLabelRes = await fetch(
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
              );
              flaggedLabel = await createLabelRes.json();
            }

            await fetch(
              `https://api.trello.com/1/cards/${userCard.id}/idLabels?value=${flaggedLabel.id}&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
              { method: "POST" }
            );
          }
        }
      }

      // ⚠️ Account <30 label (REAL board ID)
      if (isNewAccount) {
        const labelsRes = await fetch(
          `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
        );
        const labels = await labelsRes.json();

        let thirtyLabel = labels.find(l => l.name === "Account <30");
        if (!thirtyLabel) {
          const createLabelRes = await fetch(
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
          thirtyLabel = await createLabelRes.json();
        }

        await fetch(
          `https://api.trello.com/1/cards/${userCard.id}/idLabels?value=${thirtyLabel.id}&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          { method: "POST" }
        );
      }

      // 🔁 FINAL: fetch ALL labels on the card — every label is a flag
      const labelsFinalRes = await fetch(
        `https://api.trello.com/1/cards/${userCard.id}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      );
      const labelsFinal = await labelsFinalRes.json();

      const allFlags = [
        ...new Set(
          labelsFinal
            .map(l => {
              if (l.name && l.name.trim()) return l.name;
              if (l.color) return l.color.toUpperCase();
              return null;
            })
            .filter(Boolean)
        ),
      ];

      const hasFlags = allFlags.length > 0;

      // 🗒️ Trello comment in your exact format
      const commentText =
        `✅ Background Check Completed\n` +
        `Checked by: ${interaction.user.username}\n` +
        `Date: ${new Date().toUTCString()}\n` +
        `Flags: ${hasFlags ? allFlags.join(", ") : "No flags found"}`;

      const commentUrl =
        `https://api.trello.com/1/cards/${userCard.id}/actions/comments` +
        `?key=${TRELLO_API_KEY}` +
        `&token=${TRELLO_TOKEN}` +
        `&text=${encodeURIComponent(commentText)}`;

      await fetch(commentUrl, { method: "POST" }).catch(err =>
        console.error("Failed to post Trello comment:", err)
      );

      // 🧾 Discord embed
      const resultEmbed = new EmbedBuilder()
        .setTitle(`${username} (${userId})`)
        .setColor(hasFlags ? 0xed4245 : 0x57f287)
        .addFields(
          { name: "Roblox Username", value: username, inline: true },
          { name: "Display Name", value: displayName, inline: true },
          { name: "Roblox ID", value: String(userId), inline: true },
          { name: "Join Date", value: joinDate, inline: true },
          { name: "Account Age", value: `${accountAgeDays} days`, inline: true },
          {
            name: "Flags Detected",
            value: hasFlags ? `🚩 ${allFlags.join("\n🚩 ")}` : "None",
            inline: false,
          },
          {
            name: "Blacklisted Groups",
            value:
              flaggedGroups.length > 0
                ? flaggedGroups.join(", ")
                : "None",
            inline: false,
          },
          {
            name: "Trello Card",
            value: `[Open Card](${userCard.url})`,
            inline: false,
          }
        )
        .setFooter({ text: "RDUSA Background Check System" })
        .setTimestamp();

      await interaction.editReply({ content: "", embeds: [resultEmbed] });
    } catch (err) {
      console.error("Error in /backgroundcheck:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "❌ An error occurred while running the background check.",
        });
      } else {
        await interaction.reply({
          content: "❌ An error occurred while running the background check.",
          flags: 64,
        });
      }
    }
  },
};
