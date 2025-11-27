import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("antiping")
    .setDescription("Enable, disable, or check YOUR protected anti-ping status.")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("Choose what to do.")
        .setRequired(true)
        .addChoices(
          { name: "Enable", value: "enable" },
          { name: "Disable", value: "disable" },
          { name: "Status", value: "status" },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const db = client.db;
    if (!db) {
      return interaction.editReply(
        "❌ Database connection is not available. Please contact a developer."
      );
    }

    const userId = interaction.user.id;
    const mode = interaction.options.getString("mode");

    try {
      // 🔍 Check if this user is in the anti_ping_protected table
      const [rows] = await db.query(
        "SELECT enabled FROM anti_ping_protected WHERE user_id = ?",
        [userId]
      );

      if (rows.length === 0) {
        return interaction.editReply(
          "🚫 You are not configured as a protected user, so you cannot manage anti-ping settings.\n" +
          "If you believe this is a mistake, please contact a developer or high command to add you."
        );
      }

      const currentlyEnabled = !!rows[0].enabled;

      // 📊 /antiping mode: status
      if (mode === "status") {
        return interaction.editReply(
          currentlyEnabled
            ? "✅ Your anti-ping protection is currently **ENABLED**.\nMessages that ping you will be deleted (unless sent by whitelisted users/roles)."
            : "⚪ Your anti-ping protection is currently **DISABLED**.\nOther members are allowed to ping you."
        );
      }

      // ✅ /antiping mode: enable
      if (mode === "enable") {
        if (currentlyEnabled) {
          return interaction.editReply(
            "✅ Your anti-ping protection is **already ENABLED**."
          );
        }

        await db.query(
          "UPDATE anti_ping_protected SET enabled = 1 WHERE user_id = ?",
          [userId]
        );

        return interaction.editReply(
          "✅ Your anti-ping protection has been **ENABLED**.\n" +
          "From now on, messages that ping you will be blocked/deleted (unless sent by whitelisted users/roles)."
        );
      }

      // 🚫 /antiping mode: disable
      if (mode === "disable") {
        if (!currentlyEnabled) {
          return interaction.editReply(
            "⚪ Your anti-ping protection is **already DISABLED**."
          );
        }

        await db.query(
          "UPDATE anti_ping_protected SET enabled = 0 WHERE user_id = ?",
          [userId]
        );

        return interaction.editReply(
          "⚪ Your anti-ping protection has been **DISABLED**.\n" +
          "Other members are now allowed to ping you normally."
        );
      }

      // Fallback (shouldn’t happen)
      return interaction.editReply("❌ Invalid mode.");
    } catch (err) {
      console.error("❌ Error in /antiping:", err);
      return interaction.editReply(
        "❌ There was an error while updating your anti-ping settings. Please try again or contact a developer."
      );
    }
  },
};
