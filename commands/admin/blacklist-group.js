// commands/admin/blacklist-group.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const { TRELLO_API_KEY, TRELLO_TOKEN } = process.env;

// Trello board + list
const TRELLO_BOARD_ID = "DK6WJt1g";
const TRELLO_LIST_NAME = "Group Blacklist";

// Role allowed to use this command
const STAFF_ROLE_ID = "1387212542245339209";

// Mod-log channel in main server
const MOD_LOG_CHANNEL_ID = "1388886511474442250";

// Dev server command log channel
const DEV_COMMAND_LOG_CHANNEL_ID = "1388886528968622080";

// ───────────────────────────────
// 🔧 Helpers
// ───────────────────────────────

// Helper: fetch Trello list for Group Blacklist
async function getGroupBlacklistList() {
  const res = await fetch(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
  );
  if (!res.ok) {
    throw new Error(`Trello lists fetch failed (${res.status})`);
  }
  const lists = await res.json();
  const list = lists.find(
    (l) => l.name.toLowerCase() === TRELLO_LIST_NAME.toLowerCase()
  );
  if (!list) throw new Error(`List "${TRELLO_LIST_NAME}" not found on board.`);
  return list;
}

// Helper: get all cards on Group Blacklist list
async function getBlacklistCards(listId) {
  const res = await fetch(
    `https://api.trello.com/1/lists/${listId}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
  );
  if (!res.ok) {
    throw new Error(`Trello cards fetch failed (${res.status})`);
  }
  return res.json();
}

// Helper: fetch Roblox group info
async function fetchRobloxGroup(groupId) {
  const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`);
  if (!res.ok) {
    throw new Error(`Roblox API error (${res.status}) for group ${groupId}`);
  }
  const groupData = await res.json();

  const groupName = groupData.name || "Unknown";

  // Proper owner handling
  const groupOwner =
    groupData.owner
      ? (groupData.owner.displayName ||
         groupData.owner.username ||
         `User ${groupData.owner.userId}`)
      : "Vacant";

  return { groupName, groupOwner };
}

// Helper: build mod-log embed for add/remove
function buildModLogEmbed({
  action,          // "Group Blacklisted" or "Group Unblacklisted"
  groupName,
  groupId,
  groupOwner,
  reason,
  submittedBy,
  approver,
}) {
  return new EmbedBuilder()
    .setColor(action === "Group Blacklisted" ? 0xed4245 : 0x57f287)
    .setTitle(
      action === "Group Blacklisted" ? "🔒 Group Blacklisted" : "🔓 Group Unblacklisted"
    )
    .addFields(
      { name: "Group Name", value: groupName || "Unknown", inline: true },
      { name: "Group ID", value: String(groupId), inline: true },
      { name: "Group Owner", value: groupOwner || "Unknown", inline: true },
      { name: "Reason", value: reason || "N/A" },
      { name: "Submitted by", value: submittedBy, inline: true },
      { name: "Approved by", value: approver || "N/A", inline: true },
      {
        name: "Time",
        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: false,
      }
    )
    .setTimestamp();
}

// Helper: send to dev command log channel
async function sendDevLog(interaction, action, groupId) {
  try {
    const devChannel = await interaction.client.channels
      .fetch(DEV_COMMAND_LOG_CHANNEL_ID)
      .catch(() => null);
    if (!devChannel) return;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🛠 Command Used: /blacklist-group")
      .addFields(
        { name: "Action", value: action, inline: true },
        { name: "Group ID", value: String(groupId), inline: true },
        {
          name: "User",
          value: `${interaction.user.tag} (${interaction.user.id})`,
        },
        {
          name: "Guild",
          value: interaction.guild
            ? `${interaction.guild.name} (${interaction.guild.id})`
            : "Unknown",
        }
      )
      .setTimestamp();

    await devChannel.send({ embeds: [embed] });
  } catch (err) {
    console.warn("⚠️ Failed to send dev log:", err.message);
  }
}

// ───────────────────────────────
// 🧩 Command Definition
// ───────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName("blacklist-group")
    .setDescription("Add or remove a Roblox group from the blacklist.")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a group to the blacklist.")
        .addStringOption((opt) =>
          opt
            .setName("groupid")
            .setDescription("Roblox group ID")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for blacklisting")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("approvedby")
            .setDescription("Who approved this blacklist (text only)")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a group from the blacklist.")
        .addStringOption((opt) =>
          opt
            .setName("groupid")
            .setDescription("Roblox group ID")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for removal")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("approvedby")
            .setDescription("Who approved this removal (text only)")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    // 🔒 Role check
    const member = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);

    if (!member || !member.roles.cache.has(STAFF_ROLE_ID)) {
      return interaction.editReply(
        "🚫 You do not have permission to use this command."
      );
    }

    const sub = interaction.options.getSubcommand();

    // ⚠️ Support both old & new option names (just in case)
    const groupIdRaw =
      interaction.options.getString("groupid") ??
      interaction.options.getString("group_id");

    const reason = interaction.options.getString("reason");
    let approvedBy =
      interaction.options.getString("approvedby") ??
      interaction.options.getString("approved_by");

    // ✅ Extract numeric group ID only (fix for "group_id: 5508087")
    const idMatch = groupIdRaw ? groupIdRaw.match(/\d+/) : null;
    if (!idMatch) {
      await interaction.editReply("❌ You must provide a valid group ID.");
      await sendDevLog(interaction, "ERROR (invalid groupid format)", groupIdRaw ?? "N/A");
      return;
    }
    const groupId = idMatch[0];

    // Sanitize approvedBy (avoid actual mentions)
    if (approvedBy) {
      approvedBy = approvedBy.replace(/<@!?(\d+)>/g, "User$1");
    }

    try {
      // Get Trello list and cards
      const list = await getGroupBlacklistList();
      const cards = await getBlacklistCards(list.id);

      if (sub === "add") {
        // ❗ If already blacklisted, abort
        const existing = cards.find((c) => c.name === groupId);
        if (existing) {
          await interaction.editReply(
            `⚠️ Group **${groupId}** is already blacklisted.`
          );
          await sendDevLog(interaction, "ADD (already blacklisted)", groupId);
          return;
        }

        // Fetch Roblox group info
        const { groupName, groupOwner } = await fetchRobloxGroup(groupId);

        // Create Trello card (name = groupId)
        const desc =
          `**Group Name:** ${groupName}\n` +
          `**Group ID:** ${groupId}\n` +
          `**Group Owner:** ${groupOwner}\n` +
          `**Reason for blacklist:** ${reason}\n` +
          `**Submitted by:** ${interaction.user.tag} (${interaction.user.id})\n` +
          `**Approved by:** ${approvedBy}`;

        const cardRes = await fetch(
          `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idList: list.id,
              name: String(groupId), // card name = group ID
              desc,
            }),
          }
        );

        if (!cardRes.ok) {
          const txt = await cardRes.text();
          throw new Error(`Trello card create failed: ${txt}`);
        }

        // Mod-log embed
        const modEmbed = buildModLogEmbed({
          action: "Group Blacklisted",
          groupName,
          groupId,
          groupOwner,
          reason,
          submittedBy: `${interaction.user.tag} (${interaction.user.id})`,
          approver: approvedBy,
        });

        // Send mod log
        const modChannel = await interaction.client.channels
          .fetch(MOD_LOG_CHANNEL_ID)
          .catch(() => null);
        if (modChannel) {
          await modChannel.send({ embeds: [modEmbed] });
        }

        await interaction.editReply(
          `✅ Group **${groupName}** (${groupId}) has been **blacklisted**.`
        );
        await sendDevLog(interaction, "ADD", groupId);
      }

      if (sub === "remove") {
        // Must exist to remove
        const existing = cards.find((c) => c.name === groupId);
        if (!existing) {
          await interaction.editReply(
            `⚠️ Group **${groupId}** is not currently blacklisted.`
          );
          await sendDevLog(interaction, "REMOVE (not blacklisted)", groupId);
          return;
        }

        // For nicer logs, try to refetch Roblox group info
        let groupName = "Unknown";
        let groupOwner = "Unknown";
        try {
          const info = await fetchRobloxGroup(groupId);
          groupName = info.groupName;
          groupOwner = info.groupOwner;
        } catch {
          // ignore fetch failure
        }

        // Delete Trello card
        const delRes = await fetch(
          `https://api.trello.com/1/cards/${existing.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          { method: "DELETE" }
        );
        if (!delRes.ok) {
          const txt = await delRes.text();
          throw new Error(`Trello card delete failed: ${txt}`);
        }

        // Mod-log embed
        const modEmbed = buildModLogEmbed({
          action: "Group Unblacklisted",
          groupName,
          groupId,
          groupOwner,
          reason,
          submittedBy: `${interaction.user.tag} (${interaction.user.id})`,
          approver: approvedBy,
        });

        const modChannel = await interaction.client.channels
          .fetch(MOD_LOG_CHANNEL_ID)
          .catch(() => null);
        if (modChannel) {
          await modChannel.send({ embeds: [modEmbed] });
        }

        await interaction.editReply(
          `✅ Group **${groupName}** (${groupId}) has been **removed from the blacklist**.`
        );
        await sendDevLog(interaction, "REMOVE", groupId);
      }
    } catch (err) {
      console.error("❌ Error in /blacklist-group:", err);
      await interaction.editReply(
        "❌ An error occurred while processing this request."
      );
      await sendDevLog(interaction, "ERROR", groupId);
    }
  },
};
