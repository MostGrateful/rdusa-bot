// commands/utility/antiPingConfig.js
import {
  SlashCommandBuilder,
  PermissionFlagsBits
} from "discord.js";

const OWNER_ID = "238058962711216130";

export default {
  data: new SlashCommandBuilder()
    .setName("antiping")
    .setDescription("Configure anti-ping system (owner only).")

    // PROTECTED USERS
    .addSubcommand(sub =>
      sub.setName("add")
        .setDescription("Add a protected user.")
        .addUserOption(opt => opt.setName("user").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("remove")
        .setDescription("Disable protection for a user.")
        .addUserOption(opt => opt.setName("user").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("toggle")
        .setDescription("Toggle protection for a user.")
        .addUserOption(opt => opt.setName("user").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("status")
        .setDescription("Check protection status.")
        .addUserOption(opt => opt.setName("user").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("List all protected users.")
    )

    // WHITELIST USERS
    .addSubcommandGroup(group =>
      group
        .setName("whitelist")
        .setDescription("Manage whitelist users.")
        .addSubcommand(sub =>
          sub.setName("add")
            .setDescription("Add a whitelisted user.")
            .addUserOption(opt => opt.setName("user").setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName("remove")
            .setDescription("Remove a whitelisted user.")
            .addUserOption(opt => opt.setName("user").setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName("list")
            .setDescription("List all whitelisted users.")
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const db = client.db;

    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content: "🚫 Only the bot owner can use this command.",
        flags: 64
      });
    }

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    await interaction.deferReply({ flags: 64 });

    // ───────────────────────────────
    // 🔵 PROTECTED USER COMMANDS
    // ───────────────────────────────
    if (!group) {
      const user = interaction.options.getUser("user");

      if (sub === "add") {
        await db.query(
          `INSERT INTO anti_ping_protected (user_id, enabled)
           VALUES (?,1)
           ON DUPLICATE KEY UPDATE enabled=1`,
          [user.id]
        );
        return interaction.editReply(`🛡 <@${user.id}> is now protected.`);
      }

      if (sub === "remove") {
        await db.query(
          `UPDATE anti_ping_protected SET enabled=0 WHERE user_id=?`,
          [user.id]
        );
        return interaction.editReply(`❎ <@${user.id}> protection disabled.`);
      }

      if (sub === "toggle") {
        const [rows] = await db.query(
          `SELECT enabled FROM anti_ping_protected WHERE user_id=?`,
          [user.id]
        );

        let newVal = 1;
        if (rows.length) newVal = rows[0].enabled ? 0 : 1;

        await db.query(
          `INSERT INTO anti_ping_protected (user_id, enabled)
           VALUES (?,?)
           ON DUPLICATE KEY UPDATE enabled=?`,
          [user.id, newVal, newVal]
        );

        return interaction.editReply(
          `🔁 <@${user.id}> protection is now **${newVal ? "Enabled" : "Disabled"}**.`
        );
      }

      if (sub === "status") {
        const [rows] = await db.query(
          `SELECT enabled FROM anti_ping_protected WHERE user_id=?`,
          [user.id]
        );
        if (!rows.length)
          return interaction.editReply(`ℹ️ <@${user.id}> is NOT protected.`);

        return interaction.editReply(
          `ℹ️ <@${user.id}> protection: **${rows[0].enabled ? "Enabled" : "Disabled"}**`
        );
      }

      if (sub === "list") {
        const [rows] = await db.query(
          `SELECT user_id, enabled FROM anti_ping_protected`
        );
        if (!rows.length)
          return interaction.editReply("📭 No protected users.");

        const text = rows
          .map(r => `• <@${r.user_id}> — ${r.enabled ? "🟢 Enabled" : "🔴 Disabled"}`)
          .join("\n");

        return interaction.editReply(`🛡 **Protected Users:**\n\n${text}`);
      }
    }

    // ───────────────────────────────
    // 🟢 WHITELIST COMMANDS
    // ───────────────────────────────
    if (group === "whitelist") {
      if (sub === "add") {
        const user = interaction.options.getUser("user");

        await db.query(
          `INSERT INTO anti_ping_whitelist (user_id)
           VALUES (?)
           ON DUPLICATE KEY UPDATE user_id=user_id`,
          [user.id]
        );

        return interaction.editReply(`🟢 <@${user.id}> added to whitelist.`);
      }

      if (sub === "remove") {
        const user = interaction.options.getUser("user");

        await db.query(
          `DELETE FROM anti_ping_whitelist WHERE user_id=?`,
          [user.id]
        );

        return interaction.editReply(`🔴 <@${user.id}> removed from whitelist.`);
      }

      if (sub === "list") {
        const [rows] = await db.query(`SELECT user_id FROM anti_ping_whitelist`);

        if (!rows.length)
          return interaction.editReply("📭 Whitelist is empty.");

        const text = rows.map(r => `• <@${r.user_id}>`).join("\n");

        return interaction.editReply(`🟢 **Whitelisted Users:**\n\n${text}`);
      }
    }
  }
};
