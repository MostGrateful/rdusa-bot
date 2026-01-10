import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("editwarn")
    .setDescription("Modify the reason of an existing warning (by Case ID).")

    .addIntegerOption((opt) =>
      opt
        .setName("case")
        .setDescription("The Case ID of the warning to modify.")
        .setRequired(true)
    )

    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("The new reason for this warning.")
        .setRequired(true)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const caseId = interaction.options.getInteger("case");
    const newReason = interaction.options.getString("reason");
    const db = client.db;

    // ───────────────────────────────────────────────
    // 🔐 Check moderation permissions (SQL-based)
    // ───────────────────────────────────────────────
    try {
      const [rows] = await db.query(
        `SELECT * FROM mod_permissions
         WHERE guild_id = ?
         AND command_name IN ('editwarn', '*')
         AND (role_id IN (?) OR user_id = ?)`,
        [
          interaction.guild.id,
          [...interaction.member.roles.cache.keys()],
          interaction.user.id,
        ]
      );

      if (!rows || rows.length === 0) {
        return interaction.editReply(
          "🚫 You are **not authorized** to edit warnings."
        );
      }
    } catch (err) {
      console.error("SQL permission check error in /editwarn:", err);
    }

    // ───────────────────────────────────────────────
    // 🔎 Look up the warning by Case ID
    // ───────────────────────────────────────────────
    let warning;
    try {
      const [res] = await db.query(
        "SELECT * FROM mod_warnings WHERE id = ?",
        [caseId]
      );

      if (res.length === 0) {
        return interaction.editReply("❌ No warning found with that Case ID.");
      }

      warning = res[0];
    } catch (err) {
      console.error("Error reading warning:", err);
      return interaction.editReply("❌ Failed to fetch the warning from the database.");
    }

    // Store old reason for logging
    const oldReason = warning.reason;

    // ───────────────────────────────────────────────
    // ✏️ Update SQL with new reason
    // ───────────────────────────────────────────────
    try {
      await db.query(
        "UPDATE mod_warnings SET reason = ? WHERE id = ?",
        [newReason, caseId]
      );
    } catch (err) {
      console.error("Error updating warning reason:", err);
      return interaction.editReply("❌ Failed to update warning reason in the database.");
    }

    // ───────────────────────────────────────────────
    // 📢 Update mod-log embed (if message exists)
    // ───────────────────────────────────────────────
    try {
      const logChannel = await interaction.client.channels
        .fetch("1388886511474442250")
        .catch(() => null);

      if (logChannel && warning.log_message_id) {
        const msg = await logChannel.messages
          .fetch(warning.log_message_id)
          .catch(() => null);

        if (msg) {
          const updated = EmbedBuilder.from(msg.embeds[0])
            .spliceFields(2, 1, {
              name: "Reason",
              value: newReason,
            })
            .setFooter({
              text: `Case #${caseId} • Reason Edited`,
            });

          await msg.edit({ embeds: [updated] });
        }
      }
    } catch (err) {
      console.warn("⚠️ Could not update mod log embed:", err.message);
    }

    // ───────────────────────────────────────────────
    // 📨 Log to moderator channel
    // ───────────────────────────────────────────────
    try {
      const logChannel = await client.channels.fetch(
        "1388886511474442250"
      );

      const logEmbed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`✏️ Warning Reason Modified | Case #${caseId}`)
        .addFields(
          { name: "Member", value: `<@${warning.user_id}> (${warning.user_id})` },
          { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})` },
          { name: "Old Reason", value: oldReason },
          { name: "New Reason", value: newReason },
        )
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed] });
    } catch (err) {
      console.warn("⚠️ Failed to send edit log:", err);
    }

    // ───────────────────────────────────────────────
    // ✅ Reply to moderator
    // ───────────────────────────────────────────────
    return interaction.editReply(
      `✅ **Updated warning Case #${caseId}**\nOld reason → New reason successfully updated.`
    );
  },
};
