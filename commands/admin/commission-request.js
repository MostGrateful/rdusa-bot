// commands/admin/commission-request.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import fetch from "node-fetch";

function buildJumpLink(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

// ✅ Roblox username -> userId resolver (official endpoint)
async function resolveRobloxUserByUsername(username) {
  const clean = String(username || "").trim();
  if (!clean) return { ok: false, error: "No username provided." };

  // Roblox usernames are 3-20 chars
  if (clean.length < 3 || clean.length > 20) {
    return { ok: false, error: "That Roblox username length is invalid (must be 3-20 characters)." };
  }

  const url = "https://users.roblox.com/v1/usernames/users";
  const body = {
    usernames: [clean],
    excludeBannedUsers: false,
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: "Roblox lookup failed (network error)." };
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return {
      ok: false,
      error: `Roblox lookup failed (${res.status}). ${String(txt || "").slice(0, 160)}`.trim(),
    };
  }

  const data = await res.json().catch(() => null);
  const user = data?.data?.[0];

  if (!user?.id || !user?.name) {
    return { ok: false, error: "That Roblox username does not exist." };
  }

  return {
    ok: true,
    userId: String(user.id),
    username: String(user.name), // canonical casing
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName("commission-request")
    .setDescription("Submit a commission request (auto-approved).")
    .addStringOption((o) =>
      o.setName("username").setDescription("Roblox username").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("oldrank").setDescription("Old rank").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("newrank").setDescription("New rank").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for commission").setRequired(true),
    )
    .addUserOption((o) =>
      o.setName("ping").setDescription("User to ping").setRequired(true),
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction
   * @param {import("discord.js").Client} client
   */
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.editReply("❌ This command can only be used in a server.");
    }

    const db = client.db;
    if (!db) return interaction.editReply("❌ Database not available.");

    const guildId = interaction.guild.id;

    // ✅ Load commission log channel from SQL (supports both column names)
    let commissionLogChannelId = null;
    try {
      const [rows] = await db.query(
        `SELECT commission_log_channel_id, log_channel_id
         FROM guild_commission_config
         WHERE guild_id = ?
         LIMIT 1`,
        [guildId],
      );

      if (rows?.length) {
        commissionLogChannelId =
          rows[0].commission_log_channel_id || rows[0].log_channel_id || null;
      }
    } catch (e) {
      console.error("❌ commission-request config query failed:", e);
    }

    if (!commissionLogChannelId) {
      return interaction.editReply(
        "❌ Commission request log channel is not configured.\nUse /setcommissionrequestlog first.",
      );
    }

    const logChannel = await client.channels.fetch(commissionLogChannelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) {
      return interaction.editReply(
        "❌ The configured commission log channel no longer exists or isn’t a text channel.\nRun /setcommissionrequestlog again.",
      );
    }

    const usernameInput = interaction.options.getString("username", true).trim();
    const oldrank = interaction.options.getString("oldrank", true).trim();
    const newrank = interaction.options.getString("newrank", true).trim();
    const reason = interaction.options.getString("reason", true).trim();
    const ping = interaction.options.getUser("ping", true);

    if (ping.id === interaction.user.id) {
      return interaction.editReply("🚫 You cannot submit a commission request for yourself.");
    }

    // ✅ Validate Roblox username exists (and normalize casing)
    const rb = await resolveRobloxUserByUsername(usernameInput);
    if (!rb.ok) {
      return interaction.editReply(`❌ ${rb.error}`);
    }

    const username = rb.username; // canonical casing
    const robloxUserId = rb.userId;
    const robloxProfile = `https://www.roblox.com/users/${robloxUserId}/profile`;

    // ✅ Auto-approved embed
    const approvedByText = "RDUSA | Operations";
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("📗 Commission Request (Auto-Approved)")
      .addFields(
        { name: "Username", value: username || "N/A", inline: true },
        { name: "Roblox ID", value: robloxUserId || "N/A", inline: true },
        { name: "Old Rank", value: oldrank || "N/A", inline: true },
        { name: "New Rank", value: newrank || "N/A", inline: true },
        { name: "Roblox Profile", value: robloxProfile, inline: false },
        { name: "Reason", value: reason || "N/A", inline: false },
        { name: "Ping", value: `<@${ping.id}>`, inline: true },
        { name: "Requested By", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Approved By", value: approvedByText, inline: false },
        { name: "Status", value: "✅ Approved", inline: false },
      )
      .setFooter({ text: `Request by ${interaction.user.tag}` })
      .setTimestamp();

    // Send message FIRST so we have messageId
    const sentMsg = await logChannel.send({
      content: `<@${ping.id}>`,
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`commission_revoke:${"PENDING"}`)
            .setLabel("Revoke Approval")
            .setStyle(ButtonStyle.Danger),
        ),
      ],
    });

    // Persist request as APPROVED
    const payload = {
      username,
      robloxUserId,
      robloxProfile,
      oldrank,
      newrank,
      reason,
      approvedBy: approvedByText,
    };

    await db.query(
      `INSERT INTO discord_requests
        (type, guild_id, channel_id, message_id, requester_id, target_id, payload_json, status, decided_by, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, NOW())
       ON DUPLICATE KEY UPDATE
         payload_json = VALUES(payload_json),
         status = 'approved',
         decided_by = VALUES(decided_by),
         decided_at = NOW()`,
      [
        "commission",
        guildId,
        logChannel.id,
        sentMsg.id,
        interaction.user.id,
        ping.id,
        JSON.stringify(payload),
        approvedByText, // stored text
      ],
    );

    // Fetch request id for DM footer
    let requestId = "Unknown";
    try {
      const [idRows] = await db.query(
        `SELECT id FROM discord_requests WHERE type='commission' AND message_id=? LIMIT 1`,
        [sentMsg.id],
      );
      if (idRows?.length) requestId = String(idRows[0].id);
    } catch (_) {}

    // Patch button customId with real message id (persistent after restarts)
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`commission_revoke:${sentMsg.id}`)
        .setLabel("Revoke Approval")
        .setStyle(ButtonStyle.Danger),
    );

    await sentMsg.edit({ components: [row] }).catch(() => null);

    // DM requester with result + link
    const jump = buildJumpLink(guildId, logChannel.id, sentMsg.id);
    const dmEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Commission Request Approved")
      .setDescription(
        `Your commission request was **auto-approved**.\n\n**View Request:** ${jump}`,
      )
      .addFields(
        { name: "Username", value: username, inline: true },
        { name: "Roblox ID", value: robloxUserId, inline: true },
        { name: "Old Rank", value: oldrank, inline: true },
        { name: "New Rank", value: newrank, inline: true },
        { name: "Approved By", value: approvedByText, inline: false },
      )
      .setFooter({
        text: `User ID: ${ping.id} • Request ID: ${requestId} • ${new Date().toLocaleString()}`,
      })
      .setTimestamp();

    await interaction.user.send({ embeds: [dmEmbed] }).catch(() => null);

    return interaction.editReply("✅ Commission request submitted and auto-approved.");
  },
};
