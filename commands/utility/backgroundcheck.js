import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const {
  TRELLO_API_KEY,
  TRELLO_TOKEN,
  TRELLO_BOARD_SHORTLINK,
  TRELLO_BOARD_ID,
  TRELLO_LIST_BLACKLIST,
} = process.env;

// Where to send command logs
const MOD_LOG_CHANNEL_ID = "1439479062572699739";

function normalizeLabelName(name) {
  return String(name || "").trim().toLowerCase();
}

async function safeFetchJson(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore json parse errors
  }
  return { ok: res.ok, status: res.status, data };
}

async function sendModLog(interaction, embed) {
  try {
    const channel = await interaction.client.channels
      .fetch(MOD_LOG_CHANNEL_ID)
      .catch(() => null);
    if (channel) await channel.send({ embeds: [embed] }).catch(() => null);
  } catch {
    // ignore
  }
}

async function canUseBackgroundCheck(client, guildId, member) {
  const db = client.db;
  if (!db || !guildId || !member) return false;

  try {
    const [rows] = await db.query(
      `
      SELECT role_id
      FROM guild_backgroundcheck_perms
      WHERE guild_id = ?
        AND enabled = 1
      `,
      [guildId],
    );

    const allowedRoleIds = (rows || [])
      .map((r) => String(r.role_id))
      .filter(Boolean);

    if (!allowedRoleIds.length) return false;

    return member.roles.cache.some((role) => allowedRoleIds.includes(role.id));
  } catch (err) {
    console.error("❌ canUseBackgroundCheck SQL error:", err);
    return false;
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("backgroundcheck")
    .setDescription("Run a background check on a Roblox user and sync with Trello.")
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Roblox username to check")
        .setRequired(true),
    ),

  async execute(interaction, client) {
    try {
      if (!interaction.inGuild() || !interaction.guild) {
        return interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: 64,
        });
      }

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        return interaction.reply({
          content: "❌ Could not load your server member data.",
          flags: 64,
        });
      }

      const allowed = await canUseBackgroundCheck(client, interaction.guild.id, member);
      if (!allowed) {
        return interaction.reply({
          content: "❌ Unauthorized. You cannot use this command.",
          flags: 64,
        });
      }

      const username = interaction.options.getString("username", true).trim();

      await interaction.reply({
        content: `🔎 Searching Roblox profile for **${username}**...`,
        flags: 64,
      });

      // Roblox lookup
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

      // Roblox groups
      let userGroups = [];
      try {
        const groupRes = await fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
        const groupData = await groupRes.json();
        userGroups = groupData.data?.map((g) => g.group.id) || [];
      } catch (e) {
        console.error("Error fetching Roblox groups:", e);
      }

      // Trello lists
      const listsRes = await fetch(
        `https://api.trello.com/1/boards/${TRELLO_BOARD_SHORTLINK}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      );
      const lists = await listsRes.json();

      // Determine alphabetical bucket
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

      const targetList = lists.find((l) => l.name === matchedList);
      if (!targetList) {
        return interaction.editReply({
          content: `❌ No Trello list found for **${matchedList}**.`,
        });
      }

      // Get or create Trello card
      const cardsRes = await fetch(
        `https://api.trello.com/1/lists/${targetList.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      );
      const cards = await cardsRes.json();

      const desiredName = `${username} (${userId})`.toLowerCase();
      const plainName = username.toLowerCase();

      let userCard =
        cards.find((c) => c.name && c.name.toLowerCase() === desiredName) ||
        cards.find((c) => c.name && c.name.toLowerCase() === plainName);

      const description =
        `**Roblox Username:** ${username}\n` +
        `**Display Name:** ${displayName}\n` +
        `**Roblox ID:** ${userId}\n` +
        `**Join Date:** ${joinDate}`;

      if (!userCard) {
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
          },
        );
        userCard = await createCardRes.json();
      } else {
        if (userCard.name.toLowerCase() === plainName) {
          await fetch(
            `https://api.trello.com/1/cards/${userCard.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: `${username} (${userId})`, desc: description }),
            },
          );
          userCard.name = `${username} (${userId})`;
        } else {
          await fetch(
            `https://api.trello.com/1/cards/${userCard.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ desc: description }),
            },
          );
        }
      }

      // Pre-fetch card labels
      const cardLabelsRes0 = await fetch(
        `https://api.trello.com/1/cards/${userCard.id}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&limit=1000`,
      );
      const cardLabels0 = await cardLabelsRes0.json();

      async function getOrCreateBoardLabel(labelName, color) {
        const { ok, data: boardLabels } = await safeFetchJson(
          `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&limit=1000`,
        );

        if (!ok || !Array.isArray(boardLabels)) {
          throw new Error("Failed to fetch Trello board labels.");
        }

        const want = normalizeLabelName(labelName);
        let label = boardLabels.find((l) => normalizeLabelName(l.name) === want);

        if (!label) {
          const created = await safeFetchJson(
            `https://api.trello.com/1/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                idBoard: TRELLO_BOARD_ID,
                name: labelName,
                color,
              }),
            },
          );

          if (!created.ok || !created.data?.id) {
            throw new Error(`Failed to create Trello label: ${labelName}`);
          }
          label = created.data;
        }

        return label;
      }

      async function ensureCardHasLabel(cardId, cardLabels, labelId, shouldHave) {
        const hasIt = cardLabels.some((l) => l.id === labelId);

        if (shouldHave && !hasIt) {
          await fetch(
            `https://api.trello.com/1/cards/${cardId}/idLabels?value=${labelId}&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            { method: "POST" },
          );
          cardLabels.push({ id: labelId });
        }

        if (!shouldHave && hasIt) {
          await fetch(
            `https://api.trello.com/1/cards/${cardId}/idLabels/${labelId}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            { method: "DELETE" },
          );
          const idx = cardLabels.findIndex((l) => l.id === labelId);
          if (idx !== -1) cardLabels.splice(idx, 1);
        }
      }

      // Blacklist logic
      let flaggedGroups = [];

      if (TRELLO_LIST_BLACKLIST) {
        const blacklistList = lists.find(
          (l) => normalizeLabelName(l.name) === normalizeLabelName(TRELLO_LIST_BLACKLIST),
        );

        if (blacklistList) {
          const blRes = await fetch(
            `https://api.trello.com/1/lists/${blacklistList.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          );
          const blCards = await blRes.json();

          const blIds = (Array.isArray(blCards) ? blCards : [])
            .map((c) => parseInt(String(c?.name || "").trim(), 10))
            .filter((id) => !Number.isNaN(id));

          flaggedGroups = userGroups.filter((id) => blIds.includes(id));

          const blacklistedLabel = await getOrCreateBoardLabel(
            "Flagged - Blacklisted Group",
            "red",
          );

          await ensureCardHasLabel(
            userCard.id,
            cardLabels0,
            blacklistedLabel.id,
            flaggedGroups.length > 0,
          );
        }
      }

      // Account <30 label
      if (isNewAccount) {
        const thirtyLabel = await getOrCreateBoardLabel("Account <30", "yellow");
        await ensureCardHasLabel(userCard.id, cardLabels0, thirtyLabel.id, true);
      }

      // Final flags
      const labelsFinalRes = await fetch(
        `https://api.trello.com/1/cards/${userCard.id}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      );
      const labelsFinal = await labelsFinalRes.json();

      const allFlags = [
        ...new Set(
          (Array.isArray(labelsFinal) ? labelsFinal : [])
            .map((l) => (l.name && l.name.trim() ? l.name : null))
            .filter(Boolean),
        ),
      ];

      const hasFlags = allFlags.length > 0;

      // Trello comment
      const statusEmoji = hasFlags ? "🚩" : "✅";
      const flagsLine = hasFlags
        ? `Flags: 🚩 ${allFlags.join(", ")}`
        : "Flags: ✅ No flags found";

      const commentText =
        `${statusEmoji} Background Check Completed\n` +
        `Checked by: ${interaction.user.username}\n` +
        `Date: ${new Date().toUTCString()}\n` +
        `${flagsLine}`;

      const commentUrl =
        `https://api.trello.com/1/cards/${userCard.id}/actions/comments` +
        `?key=${TRELLO_API_KEY}` +
        `&token=${TRELLO_TOKEN}` +
        `&text=${encodeURIComponent(commentText)}`;

      await fetch(commentUrl, { method: "POST" }).catch((err) =>
        console.error("Failed to post Trello comment:", err),
      );

      // Discord embed (PUBLIC)
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
            value: flaggedGroups.length > 0 ? flaggedGroups.join(", ") : "None",
            inline: false,
          },
          {
            name: "Trello Card",
            value: `[Open Card](${userCard.url})`,
            inline: false,
          },
        )
        .setFooter({ text: "RDUSA Background Check System" })
        .setTimestamp();

      await interaction.channel.send({ embeds: [resultEmbed] });

      const logEmbed = new EmbedBuilder()
        .setColor(hasFlags ? 0xed4245 : 0x57f287)
        .setTitle("🧾 Background Check Logged")
        .addFields(
          { name: "Checked By", value: interaction.user.tag, inline: true },
          { name: "Roblox Username", value: username, inline: true },
          { name: "Roblox ID", value: String(userId), inline: true },
          { name: "Account Age", value: `${accountAgeDays} days`, inline: true },
          {
            name: "Flags",
            value: hasFlags ? allFlags.join(", ") : "None",
            inline: false,
          },
          {
            name: "Blacklisted Groups",
            value: flaggedGroups.length > 0 ? flaggedGroups.join(", ") : "None",
            inline: false,
          },
          { name: "Trello Card", value: userCard.url || "N/A", inline: false },
        )
        .setTimestamp();

      await sendModLog(interaction, logEmbed);

      await interaction.editReply({ content: "✅ Background check posted.", embeds: [] });
    } catch (err) {
      console.error("Error in /backgroundcheck:", err);

      try {
        const failEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("❌ Background Check Failed")
          .addFields(
            { name: "User", value: interaction.user.tag, inline: true },
            {
              name: "Channel",
              value: interaction.channel?.id ? `<#${interaction.channel.id}>` : "Unknown",
              inline: true,
            },
            { name: "Error", value: String(err?.message || err).slice(0, 1024), inline: false },
          )
          .setTimestamp();

        await sendModLog(interaction, failEmbed);
      } catch {}

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