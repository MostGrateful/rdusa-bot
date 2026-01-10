import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

const LOG_CHANNEL_ID = "1389010246030069820";

export default {
  data: new SlashCommandBuilder()
    .setName("commission-request")
    .setDescription("Submit a commission request for review.")
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

    const username = interaction.options.getString("username", true).trim();
    const oldrank = interaction.options.getString("oldrank", true).trim();
    const newrank = interaction.options.getString("newrank", true).trim();
    const reason = interaction.options.getString("reason", true).trim();
    const ping = interaction.options.getUser("ping", true);

    if (ping.id === interaction.user.id) {
      return interaction.editReply("🚫 You cannot submit a commission request for yourself.");
    }

    const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) {
      return interaction.editReply("❌ Log channel not found or not a text channel.");
    }

    // Base payload stored in SQL
    const payload = { username, oldrank, newrank, reason };

    // Build embed
    const embed = new EmbedBuilder()
      .setColor(0x43b581)
      .setTitle("📗 Commission Request")
      .addFields(
        { name: "Username", value: username || "N/A", inline: true },
        { name: "Old Rank", value: oldrank || "N/A", inline: true },
        { name: "New Rank", value: newrank || "N/A", inline: true },
        { name: "Reason", value: reason || "N/A", inline: false },
        { name: "Ping", value: `<@${ping.id}>`, inline: true },
        { name: "Requested By", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Status", value: "⏳ Pending", inline: false },
      )
      .setFooter({ text: `Request by ${interaction.user.tag}` })
      .setTimestamp();

    // Send message first so we have messageId for persistent button IDs
    const sentMsg = await logChannel.send({
      content: `<@${ping.id}>`,
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("commission_accept:PENDING")
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("commission_deny:PENDING")
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger),
        ),
      ],
    });

    // Insert/Update SQL record for persistence across restarts
    // If it already exists and is not pending, we remove buttons immediately.
    let existingStatus = "pending";
    try {
      const [rows] = await db.query(
        "SELECT status FROM discord_requests WHERE type='commission' AND message_id=? LIMIT 1",
        [sentMsg.id],
      );
      if (rows?.length) existingStatus = rows[0].status || "pending";
    } catch (_) {}

    await db.query(
      `INSERT INTO discord_requests
        (type, guild_id, channel_id, message_id, requester_id, target_id, payload_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json)`,
      [
        "commission",
        interaction.guild.id,
        logChannel.id,
        sentMsg.id,
        interaction.user.id,
        ping.id,
        JSON.stringify(payload),
      ],
    );

    // If the request is already processed for some reason, post without buttons.
    if (existingStatus !== "pending") {
      await sentMsg.edit({ components: [] }).catch(() => null);
      return interaction.editReply("✅ Commission request submitted (already processed — buttons removed).");
    }

    // Now patch the buttons with the correct messageId
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`commission_accept:${sentMsg.id}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`commission_deny:${sentMsg.id}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger),
    );

    await sentMsg.edit({ components: [row] }).catch(() => null);

    return interaction.editReply("✅ Commission request submitted for review.");
  },
};
