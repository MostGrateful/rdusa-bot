import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

function buildJumpLink(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function buildCommissionEmbedFromRecord(record) {
  const payload = JSON.parse(record.payload_json || "{}");

  const embed = new EmbedBuilder()
    .setColor(
      record.status === "approved"
        ? 0x57f287
        : record.status === "denied"
          ? 0xed4245
          : record.status === "cancelled"
            ? 0x5865f2
            : 0xfee75c
    )
    .setTitle("📗 Commission Request")
    .addFields(
      { name: "Username", value: payload.username || "N/A", inline: true },
      { name: "Roblox ID", value: payload.robloxUserId || "N/A", inline: true },
      { name: "Old Rank", value: payload.oldrank || "N/A", inline: true },
      { name: "New Rank", value: payload.newrank || "N/A", inline: true },
      { name: "Roblox Profile", value: payload.robloxProfile || "N/A", inline: false },
      { name: "Reason", value: payload.reason || "N/A", inline: false },
      { name: "Ping", value: `<@${record.target_id}>`, inline: true },
      { name: "Requested By", value: `<@${record.requester_id}>`, inline: true },
      {
        name: "Status",
        value:
          record.status === "approved"
            ? "✅ Approved"
            : record.status === "denied"
              ? "❌ Denied"
              : record.status === "cancelled"
                ? "🛑 Cancelled"
                : "⏳ Pending",
        inline: false,
      },
      { name: "Reviewed By", value: record.decided_by || "Pending Review", inline: false }
    )
    .setFooter({ text: `Request ID: ${record.id}` })
    .setTimestamp(record.decided_at ? new Date(record.decided_at) : new Date());

  if (record.decision_reason) {
    embed.addFields({ name: "Decision Reason", value: record.decision_reason, inline: false });
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

async function isApprovedReviewer(db, guildId, userId) {
  const [rows] = await db.query(
    `SELECT 1
     FROM guild_commission_approvers
     WHERE guild_id = ? AND discord_user_id = ?
     LIMIT 1`,
    [String(guildId), String(userId)]
  );

  return rows.length > 0;
}

async function getCommissionRecordByMessageId(db, messageId) {
  const [rows] = await db.query(
    `SELECT * FROM discord_requests WHERE type='commission' AND message_id = ? LIMIT 1`,
    [messageId]
  );
  return rows?.[0] || null;
}

async function dmRequestUsers(client, record) {
  const embed = buildCommissionEmbedFromRecord(record);
  const jump = buildJumpLink(record.guild_id, record.channel_id, record.message_id);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Review Request")
      .setStyle(ButtonStyle.Link)
      .setURL(jump)
  );

  const requester = await client.users.fetch(record.requester_id).catch(() => null);
  const target = await client.users.fetch(record.target_id).catch(() => null);

  if (requester) {
    await requester.send({ embeds: [embed], components: [row] }).catch(() => null);
  }

  if (target) {
    await target.send({ embeds: [embed], components: [row] }).catch(() => null);
  }
}

export async function handleCommissionButtons(interaction, client) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("commission_")) return false;

  const db = client.db;
  const [action, messageId] = interaction.customId.split(":");

  const record = await getCommissionRecordByMessageId(db, messageId);
  if (!record) {
    await interaction.reply({ content: "❌ Request record not found.", flags: 64 }).catch(() => {});
    return true;
  }

  if (String(record.guild_id) !== String(interaction.guildId)) {
    await interaction.reply({
      content: "❌ This request does not belong to this server.",
      flags: 64,
    }).catch(() => {});
    return true;
  }

  if (record.status !== "pending") {
    await interaction.reply({ content: "❌ This request is no longer pending.", flags: 64 }).catch(() => {});
    return true;
  }

  if (action === "commission_approve") {
    const allowed = await isApprovedReviewer(db, record.guild_id, interaction.user.id);
    if (!allowed) {
      await interaction.reply({
        content: "❌ You are not approved to review this request in this server.",
        flags: 64,
      }).catch(() => {});
      return true;
    }

    await db.query(
      `UPDATE discord_requests
       SET status='approved', decided_by=?, decided_at=NOW(), decision_reason=NULL
       WHERE id=?`,
      [interaction.user.tag, record.id]
    );

    const updated = await getCommissionRecordByMessageId(db, messageId);

    await interaction.message.edit({
      embeds: [buildCommissionEmbedFromRecord(updated)],
      components: [],
    }).catch(() => null);

    await dmRequestUsers(client, updated);
    await interaction.reply({ content: "✅ Request approved.", flags: 64 }).catch(() => {});
    return true;
  }

  if (action === "commission_deny") {
    const allowed = await isApprovedReviewer(db, record.guild_id, interaction.user.id);
    if (!allowed) {
      await interaction.reply({
        content: "❌ You are not approved to review this request in this server.",
        flags: 64,
      }).catch(() => {});
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`commission_deny_modal:${messageId}`)
      .setTitle("Deny Commission Request");

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (action === "commission_cancel") {
    if (String(record.requester_id) !== String(interaction.user.id)) {
      await interaction.reply({
        content: "❌ Only the original requester can cancel this request.",
        flags: 64,
      }).catch(() => {});
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`commission_cancel_modal:${messageId}`)
      .setTitle("Cancel Commission Request");

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  return false;
}

export async function handleCommissionModals(interaction, client) {
  if (!interaction.isModalSubmit()) return false;
  if (
    !interaction.customId.startsWith("commission_deny_modal:") &&
    !interaction.customId.startsWith("commission_cancel_modal:")
  ) {
    return false;
  }

  const db = client.db;
  const [modalId, messageId] = interaction.customId.split(":");
  const record = await getCommissionRecordByMessageId(db, messageId);

  if (!record) {
    await interaction.reply({ content: "❌ Request record not found.", flags: 64 }).catch(() => {});
    return true;
  }

  if (String(record.guild_id) !== String(interaction.guildId)) {
    await interaction.reply({
      content: "❌ This request does not belong to this server.",
      flags: 64,
    }).catch(() => {});
    return true;
  }

  if (record.status !== "pending") {
    await interaction.reply({ content: "❌ This request is no longer pending.", flags: 64 }).catch(() => {});
    return true;
  }

  const reason = interaction.fields.getTextInputValue("reason")?.trim();
  if (!reason) {
    await interaction.reply({ content: "❌ Reason is required.", flags: 64 }).catch(() => {});
    return true;
  }

  if (modalId === "commission_deny_modal") {
    const allowed = await isApprovedReviewer(db, record.guild_id, interaction.user.id);
    if (!allowed) {
      await interaction.reply({
        content: "❌ You are not approved to review this request in this server.",
        flags: 64,
      }).catch(() => {});
      return true;
    }

    await db.query(
      `UPDATE discord_requests
       SET status='denied', decided_by=?, decided_at=NOW(), decision_reason=?
       WHERE id=?`,
      [interaction.user.tag, reason, record.id]
    );

    const updated = await getCommissionRecordByMessageId(db, messageId);

    await interaction.message.edit({
      embeds: [buildCommissionEmbedFromRecord(updated)],
      components: [],
    }).catch(() => null);

    await dmRequestUsers(client, updated);
    await interaction.reply({ content: "✅ Request denied.", flags: 64 }).catch(() => {});
    return true;
  }

  if (modalId === "commission_cancel_modal") {
    if (String(record.requester_id) !== String(interaction.user.id)) {
      await interaction.reply({
        content: "❌ Only the original requester can cancel this request.",
        flags: 64,
      }).catch(() => {});
      return true;
    }

    await db.query(
      `UPDATE discord_requests
       SET status='cancelled', decided_by=?, decided_at=NOW(), decision_reason=?
       WHERE id=?`,
      [interaction.user.tag, reason, record.id]
    );

    const updated = await getCommissionRecordByMessageId(db, messageId);

    await interaction.message.edit({
      embeds: [buildCommissionEmbedFromRecord(updated)],
      components: [],
    }).catch(() => null);

    await dmRequestUsers(client, updated);
    await interaction.reply({ content: "✅ Request cancelled.", flags: 64 }).catch(() => {});
    return true;
  }

  return false;
}