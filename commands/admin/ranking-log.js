// commands/utility/ranking-log.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const {
  TRELLO_API_KEY,
  TRELLO_TOKEN,
  TRELLO_BOARD_ID,
  ROWIFI_API_KEY,
  ROWIFI_GUILD_ID,
} = process.env;

// Authorized staff role ID
const AUTHORIZED_ROLE_ID = "1369443780381638676";

const ROWIFI_BASE_URL = "https://api.rowifi.xyz/v3";

/**
 * Get all entries linked to a Roblox user in this guild via RoWifi.
 *
 * Returns:
 *   - null  => RoWifi config missing, check skipped
 *   - { linked: false, entries: [] }
 *   - { linked: true,  entries: [...] }
 */
async function getRowifiLinksForRoblox(robloxId) {
  if (!ROWIFI_API_KEY || !ROWIFI_GUILD_ID) {
    console.warn(
      "[ranking-log] ROWIFI_API_KEY or ROWIFI_GUILD_ID missing; skipping RoWifi check."
    );
    return null;
  }

  const url = `${ROWIFI_BASE_URL}/guilds/${ROWIFI_GUILD_ID}/members/roblox/${robloxId}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bot ${ROWIFI_API_KEY}`,
    },
  });

  if (res.status === 404) {
    // Not linked in this guild or reverse-search not consented
    return { linked: false, entries: [] };
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `RoWifi verification request failed [${res.status}]: ${text}`
    );
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    return { linked: false, entries: [] };
  }

  // You can uncomment this if you want to see the exact data once:
  // console.log("[ranking-log] RoWifi /members/roblox response:", data);

  return { linked: true, entries: data };
}

export default {
  data: new SlashCommandBuilder()
    .setName("ranking-log")
    .setDescription(
      "Log a ranking change, verify RoWifi link, and log to Trello."
    )
    .addStringOption(o =>
      o
        .setName("username")
        .setDescription("Roblox username")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("oldrank")
        .setDescription("Old Rank")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("newrank")
        .setDescription("New Rank")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("reason")
        .setDescription("Reason for rank change")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction) {
    const member = interaction.member;
    if (!member.roles.cache.has(AUTHORIZED_ROLE_ID)) {
      return interaction.reply({
        content: "🚫 You do not have permission to use this command.",
        flags: 64,
      });
    }

    await interaction.reply({
      content: "🗂️ Logging ranking change...",
      flags: 64,
    });

    const username = interaction.options.getString("username").trim();
    const oldrank = interaction.options.getString("oldrank").trim();
    const newrank = interaction.options.getString("newrank").trim();
    const reason = interaction.options.getString("reason").trim();

    try {
      // 🎮 Roblox lookup
      const res = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username] }),
      });

      if (!res.ok) {
        console.error("Roblox username lookup failed:", await res.text());
        return interaction.editReply({
          content: `❌ Failed to look up Roblox user **${username}** (Roblox API error).`,
        });
      }

      const data = await res.json();
      const user = data?.data?.[0];
      if (!user) {
        return interaction.editReply({
          content: `❌ Roblox user **${username}** not found.`,
        });
      }

      const userId = user.id;
      const displayName = user.displayName;

      const profileRes = await fetch(
        `https://users.roblox.com/v1/users/${userId}`
      );
      const profile = await profileRes.json();
      const joinDate = new Date(profile.created).toLocaleDateString();

      // 📝 Discord log embed
      const embed = new EmbedBuilder()
        .setColor(0x43b581)
        .setTitle("📘 Ranking Log")
        .setDescription(
          `**Username:** ${username}\n` +
            `**Old Rank:** ${oldrank}\n` +
            `**New Rank:** ${newrank}\n` +
            `**Reason:** ${reason}`
        )
        .addFields(
          { name: "Display Name", value: displayName, inline: true },
          { name: "Join Date", value: joinDate, inline: true }
        )
        .setFooter({ text: `Logged by ${interaction.user.tag}` })
        .setTimestamp();

      const logChannel = await interaction.client.channels.fetch(
        "1389010276820717618"
      );
      const sentMsg = await logChannel.send({ embeds: [embed] });

      // 🗂️ Trello Log
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
      for (const [range, regex] of Object.entries(ranges)) {
        if (regex.test(firstChar)) {
          listName = range;
          break;
        }
      }

      const list = lists.find(l => l.name === listName);

      if (!list) {
        console.error("Trello list not found for range:", listName);
        await interaction.editReply({
          content:
            `⚠️ Logged in Discord, but could not find Trello list for **${listName}**.`,
        });
      } else {
        const cards = await fetch(
          `https://api.trello.com/1/lists/${list.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
        ).then(r => r.json());

        const cardName = `${username} (${userId})`;
        let card = cards.find(c => c.name === cardName);

        const desc =
          `**Roblox Username:** ${username}\n` +
          `**Display Name:** ${displayName}\n` +
          `**Roblox ID:** ${userId}\n` +
          `**Join Date:** ${joinDate}`;

        if (!card) {
          const createRes = await fetch(
            `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                idList: list.id,
                name: cardName,
                desc,
              }),
            }
          );
          card = await createRes.json();
        } else {
          await fetch(
            `https://api.trello.com/1/cards/${card.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ desc }),
            }
          );
        }

        const comment =
          `📘 Ranking Change Logged\n` +
          `By: ${interaction.user.tag}\n` +
          `Date: ${new Date().toUTCString()}\n` +
          `**Old Rank:** ${oldrank}\n` +
          `**New Rank:** ${newrank}\n` +
          `**Reason:** ${reason}`;

        await fetch(
          `https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text:
                `${comment}\n\n` +
                `[View Discord Log](https://discord.com/channels/${interaction.guild.id}/${logChannel.id}/${sentMsg.id})`,
            }),
          }
        );
      }

      // 🔗 RoWifi verification (no more auto-sync)
      try {
        const rowifiResult = await getRowifiLinksForRoblox(userId);

        if (rowifiResult === null) {
          await interaction.followUp({
            content:
              "⚠️ RoWifi check skipped (missing ROWIFI_API_KEY or ROWIFI_GUILD_ID in `.env`).",
            flags: 64,
          });
        } else if (!rowifiResult.linked) {
          await interaction.followUp({
            content:
              `❌ This Roblox account **${username}** is not linked in RoWifi for this guild (or reverse-search not consented).`,
            flags: 64,
          });
        } else {
          await interaction.followUp({
            content:
              `✅ RoWifi verification: **${username}** is linked in this guild.\n` +
              `ℹ️ To update their Discord roles, please run your RoWifi update command (e.g. \`/update\`).`,
            flags: 64,
          });
        }
      } catch (err) {
        console.error("[ranking-log] RoWifi verification error:", err);
        await interaction.followUp({
          content:
            "⚠️ RoWifi verification failed due to an API error. Ranking log is still recorded.",
          flags: 64,
        });
      }

      // Final success message
      await interaction.editReply({
        content: `✅ Ranking log for **${username}** recorded successfully.`,
      });
    } catch (err) {
      console.error("❌ Error in /ranking-log:", err);
      try {
        await interaction.editReply({
          content: "❌ Error logging ranking change.",
        });
      } catch {
        // ignore
      }
    }
  },
};
