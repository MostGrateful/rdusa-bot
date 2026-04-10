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

function buildCommissionEmbed({
  username,
  robloxUserId,
  robloxProfile,
  oldrank,
  newrank,
  reason,
  pingUserId,
  requesterId,
  status,
  decidedBy = "Pending Review",
  decisionReason = null,
  requestId = "Pending",
}) {
  const embed = new EmbedBuilder()
    .setColor(
      status === "approved"
        ? 0x57f287
        : status === "denied"
          ? 0xed4245
          : status === "cancelled"
            ? 0x5865f2
            : 0xfee75c
    )
    .setTitle("📗 Commission Request")
    .addFields(
      { name: "Username", value: username || "N/A", inline: true },
      { name: "Roblox ID", value: robloxUserId || "N/A", inline: true },
      { name: "Old Rank", value: oldrank || "N/A", inline: true },
      { name: "New Rank", value: newrank || "N/A", inline: true },
      { name: "Roblox Profile", value: robloxProfile || "N/A", inline: false },
      { name: "Reason", value: reason || "N/A", inline: false },
      { name: "Ping", value: `<@${pingUserId}>`, inline: true },
      { name: "Requested By", value: `<@${requesterId}>`, inline: true },
      {
        name: "Status",
        value:
          status === "approved"
            ? "✅ Approved"
            : status === "denied"
              ? "❌ Denied"
              : status === "cancelled"
                ? "🛑 Cancelled"
                : "⏳ Pending",
        inline: false,
      },
      { name: "Reviewed By", value: decidedBy || "Pending Review", inline: false }
    )
    .setFooter({ text: `Request ID: ${requestId}` })
    .setTimestamp();

  if (decisionReason) {
    embed.addFields({ name: "Decision Reason", value: decisionReason, inline: false });
  }

  return embed;
}

function buildPendingButtons(messageId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`commission_approve:${messageId}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`commission_deny:${messageId}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`commission_cancel:${messageId}`)
        .setLabel("Cancel Request")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

async function resolveRobloxUserByUsername(username) {
  const clean = String(username || "").trim();
  if (!clean) return { ok: false, error: "No username provided." };

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
  } catch {
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
    username: String(user.name),
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName("commission-request")
    .setDescription("Submit a commission request.")
    .addStringOption((o) =>
      o.setName("username").setDescription("Roblox username").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("oldrank").setDescription("Old rank").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("newrank").setDescription("New rank").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for commission").setRequired(true)
    )
    .addUserOption((o) =>
      o.setName("ping").setDescription("User to ping").setRequired(true)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.editReply("❌ This command can only be used in a server.");
    }

    const db = client.db;
    if (!db) return interaction.editReply("❌ Database not available.");

    const guildId = interaction.guild.id;

    let commissionLogChannelId = null;
    try {
      const [rows] = await db.query(
        `SELECT commission_log_channel_id, log_channel_id
         FROM guild_commission_config
         WHERE guild_id = ?
         LIMIT 1`,
        [guildId]
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
        "❌ Commission request log channel is not configured.\nUse /setcommissionrequestlog first."
      );
    }

    const logChannel =
      interaction.guild.channels.cache.get(commissionLogChannelId) ||
      (await interaction.guild.channels.fetch(commissionLogChannelId).catch(() => null));

    if (!logChannel || !logChannel.isTextBased()) {
      return interaction.editReply(
        "❌ The configured commission log channel no longer exists or isn’t a text channel.\nRun /setcommissionrequestlog again."
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

    const rb = await resolveRobloxUserByUsername(usernameInput);
    if (!rb.ok) {
      return interaction.editReply(`❌ ${rb.error}`);
    }

    const username = rb.username;
    const robloxUserId = rb.userId;
    const robloxProfile = `https://www.roblox.com/users/${robloxUserId}/profile`;

    const initialEmbed = buildCommissionEmbed({
      username,
      robloxUserId,
      robloxProfile,
      oldrank,
      newrank,
      reason,
      pingUserId: ping.id,
      requesterId: interaction.user.id,
      status: "pending",
      decidedBy: "Pending Review",
      decisionReason: null,
      requestId: "Pending",
    });

    const sentMsg = await logChannel.send({
      content: `<@${ping.id}>`,
      embeds: [initialEmbed],
    });

    const payload = {
      username,
      robloxUserId,
      robloxProfile,
      oldrank,
      newrank,
      reason,
    };

    await db.query(
      `INSERT INTO discord_requests
        (type, guild_id, channel_id, message_id, requester_id, target_id, payload_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         payload_json = VALUES(payload_json),
         status = 'pending',
         decided_by = NULL,
         decided_at = NULL,
         decision_reason = NULL`,
      [
        "commission",
        guildId,
        logChannel.id,
        sentMsg.id,
        interaction.user.id,
        ping.id,
        JSON.stringify(payload),
      ]
    );

    const [idRows] = await db.query(
      `SELECT id FROM discord_requests WHERE type='commission' AND message_id=? LIMIT 1`,
      [sentMsg.id]
    );

    const requestId = idRows?.length ? String(idRows[0].id) : "Unknown";

    const finalEmbed = buildCommissionEmbed({
      username,
      robloxUserId,
      robloxProfile,
      oldrank,
      newrank,
      reason,
      pingUserId: ping.id,
      requesterId: interaction.user.id,
      status: "pending",
      decidedBy: "Pending Review",
      decisionReason: null,
      requestId,
    });

    await sentMsg.edit({
      embeds: [finalEmbed],
      components: buildPendingButtons(sentMsg.id),
    });

    const jump = buildJumpLink(guildId, logChannel.id, sentMsg.id);
    const dmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Review Request")
        .setStyle(ButtonStyle.Link)
        .setURL(jump)
    );

    const pingDmEmbed = buildCommissionEmbed({
      username,
      robloxUserId,
      robloxProfile,
      oldrank,
      newrank,
      reason,
      pingUserId: ping.id,
      requesterId: interaction.user.id,
      status: "pending",
      decidedBy: "Pending Review",
      decisionReason: null,
      requestId,
    });

    const requesterDmEmbed = buildCommissionEmbed({
      username,
      robloxUserId,
      robloxProfile,
      oldrank,
      newrank,
      reason,
      pingUserId: ping.id,
      requesterId: interaction.user.id,
      status: "pending",
      decidedBy: "Pending Review",
      decisionReason: null,
      requestId,
    });

    await ping.send({
      embeds: [pingDmEmbed],
      components: [dmRow],
    }).catch(() => null);

    await interaction.user.send({
      embeds: [requesterDmEmbed],
      components: [dmRow],
    }).catch(() => null);

    return interaction.editReply("✅ Commission request submitted and is now pending review.");
  },
};