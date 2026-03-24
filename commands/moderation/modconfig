// commands/Moderation/modconfig.js
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("modconfig")
    .setDescription("Configure which roles/users can use moderation commands.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // /modconfig add
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Allow a role or user to use a moderation command.")

        // ✅ REQUIRED options FIRST
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Whether to apply this to a role or a user.")
            .setRequired(true)
            .addChoices(
              { name: "Role", value: "role" },
              { name: "User", value: "user" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("command")
            .setDescription("Moderation command to allow them to use.")
            .setRequired(true)
            .addChoices(
              { name: "All moderation commands", value: "*" },
              { name: "warn", value: "warn" },
              { name: "warnings", value: "warnings" },
              { name: "delwarn", value: "delwarn" },
              { name: "clearwarnings", value: "clearwarnings" }
            )
        )

        // 🔽 OPTIONAL options AFTER required ones
        .addRoleOption((opt) =>
          opt
            .setName("role")
            .setDescription("Role to allow (required if type = Role).")
        )
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to allow (required if type = User).")
        )
    )

    // /modconfig remove
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a role or user from moderation permissions.")

        // ✅ REQUIRED options FIRST
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Whether to remove a role or user entry.")
            .setRequired(true)
            .addChoices(
              { name: "Role", value: "role" },
              { name: "User", value: "user" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("command")
            .setDescription("Which command permission to remove.")
            .setRequired(true)
            .addChoices(
              { name: "All moderation commands", value: "*" },
              { name: "warn", value: "warn" },
              { name: "warnings", value: "warnings" },
              { name: "delwarn", value: "delwarn" },
              { name: "clearwarnings", value: "clearwarnings" }
            )
        )

        // 🔽 OPTIONAL options AFTER required ones
        .addRoleOption((opt) =>
          opt
            .setName("role")
            .setDescription("Role to remove (required if type = Role).")
        )
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to remove (required if type = User).")
        )
    )

    // /modconfig list
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Show which roles/users are allowed to use moderation commands.")
        .addStringOption((opt) =>
          opt
            .setName("command")
            .setDescription("Filter by a specific command (optional).")
            .addChoices(
              { name: "All commands", value: "*" },
              { name: "warn", value: "warn" },
              { name: "warnings", value: "warnings" },
              { name: "delwarn", value: "delwarn" },
              { name: "clearwarnings", value: "clearwarnings" }
            )
        )
    ),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const db = client.db;
    if (!db) {
      return interaction.editReply("❌ Database connection error.");
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === "add") {
      const type = interaction.options.getString("type", true);
      const commandName = interaction.options.getString("command", true);

      let roleId = null;
      let userId = null;

      if (type === "role") {
        const role = interaction.options.getRole("role");
        if (!role) return interaction.editReply("❌ You must select a role.");
        roleId = role.id;
      } else if (type === "user") {
        const user = interaction.options.getUser("user");
        if (!user) return interaction.editReply("❌ You must select a user.");
        userId = user.id;
      }

      try {
        await db.query(
          `INSERT INTO mod_permissions (guild_id, command_name, role_id, user_id)
           VALUES (?, ?, ?, ?)`,
          [guildId, commandName, roleId, userId]
        );
      } catch (err) {
        console.error("❌ Failed to insert mod permission:", err);
        return interaction.editReply("❌ Failed to update moderation configuration.");
      }

      return interaction.editReply(
        `✅ Added ${
          type === "role" ? `<@&${roleId}>` : `<@${userId}>`
        } to **${commandName}** permissions.`
      );
    }

    if (sub === "remove") {
      const type = interaction.options.getString("type", true);
      const commandName = interaction.options.getString("command", true);

      let roleId = null;
      let userId = null;

      if (type === "role") {
        const role = interaction.options.getRole("role");
        if (!role) return interaction.editReply("❌ You must select a role.");
        roleId = role.id;
      } else if (type === "user") {
        const user = interaction.options.getUser("user");
        if (!user) return interaction.editReply("❌ You must select a user.");
        userId = user.id;
      }

      try {
        await db.query(
          `DELETE FROM mod_permissions
           WHERE guild_id = ?
             AND command_name = ?
             AND ${type === "role" ? "role_id" : "user_id"} = ?`,
          [guildId, commandName, type === "role" ? roleId : userId]
        );
      } catch (err) {
        console.error("❌ Failed to delete mod permission:", err);
        return interaction.editReply("❌ Failed to update moderation configuration.");
      }

      return interaction.editReply(
        `✅ Removed ${
          type === "role" ? `<@&${roleId}>` : `<@${userId}>`
        } from **${commandName}** permissions.`
      );
    }

    if (sub === "list") {
      const commandName = interaction.options.getString("command") || "*";

      let rows;
      try {
        if (commandName === "*" || commandName === "All commands") {
          [rows] = await db.query(
            `SELECT id, command_name, role_id, user_id
             FROM mod_permissions
             WHERE guild_id = ?
             ORDER BY command_name ASC, id ASC`,
            [guildId]
          );
        } else {
          [rows] = await db.query(
            `SELECT id, command_name, role_id, user_id
             FROM mod_permissions
             WHERE guild_id = ? AND command_name = ?
             ORDER BY id ASC`,
            [guildId, commandName]
          );
        }
      } catch (err) {
        console.error("❌ Failed to read mod permissions:", err);
        return interaction.editReply(
          "❌ Failed to read moderation configuration from the database."
        );
      }

      if (!rows || rows.length === 0) {
        return interaction.editReply(
          commandName === "*" || commandName === "All commands"
            ? "ℹ️ No moderation permissions have been configured yet."
            : `ℹ️ No specific permissions set for **${commandName}**.`
        );
      }

      const lines = rows.map((row) => {
        const label =
          row.role_id != null
            ? `<@&${row.role_id}>`
            : row.user_id != null
            ? `<@${row.user_id}>`
            : "`(unknown)`";
        return `• **${row.command_name}** → ${label}`;
      });

      return interaction.editReply({
        content:
          `📋 **Moderation Permissions**\n` +
          (commandName !== "*" && commandName !== "All commands"
            ? `Command filter: **${commandName}**\n\n`
            : "\n") +
          lines.join("\n"),
      });
    }
  },
};
