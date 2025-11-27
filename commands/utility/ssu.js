// commands/utility/ssu.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";

const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours in ms

export default {
  data: new SlashCommandBuilder()
    .setName("ssu")
    .setDescription("Announce a server startup (SSU) with a 2-hour cooldown.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName("game")
        .setDescription("Game/server you are starting (optional).")
        .setRequired(false)
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction
   * @param {import("discord.js").Client} client
   */
  async execute(interaction, client) {
    const db = client.db;
    const game = interaction.options.getString("game") || "RDUSA";

    try {
      // Ephemeral defer (using flags to avoid deprecated 'ephemeral' field)
      await interaction.deferReply({ flags: 64 });

      // ───────────────────────────────
      // ⏰ Global 2-hour cooldown (SQL)
      // ───────────────────────────────
      const [rows] = await db.query(
        "SELECT last_ssu_time FROM bot_config WHERE id = 1"
      );

      let lastTime = 0;
      if (rows.length > 0 && rows[0].last_ssu_time) {
        lastTime = Number(rows[0].last_ssu_time);
      }

      const now = Date.now();
      const diff = now - lastTime;

      if (diff < COOLDOWN_MS) {
        const remainingMs = COOLDOWN_MS - diff;
        const remainingMinutes = Math.ceil(remainingMs / (1000 * 60));
        const hours = Math.floor(remainingMinutes / 60);
        const minutes = remainingMinutes % 60;

        let timeText = "";
        if (hours > 0) {
          timeText += `${hours} hour${hours !== 1 ? "s" : ""}`;
        }
        if (minutes > 0) {
          if (timeText.length > 0) timeText += " ";
          timeText += `${minutes} minute${minutes !== 1 ? "s" : ""}`;
        }

        return interaction.editReply(
          `🕒 **SSU is on cooldown.**\nYou can use \`/ssu\` again in **${timeText}**.`
        );
      }

      // Update last_ssu_time in DB (not on cooldown)
      await db.query(
        "UPDATE bot_config SET last_ssu_time = ? WHERE id = 1",
        [now]
      );

      // ───────────────────────────────
      // 📣 Build SSU Embed
      // ───────────────────────────────
      const ssuEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🟢 Server Startup (SSU)")
        .setDescription(
          `A new session has been started for **${game}**.\n\n` +
          `Please join the game and follow all instructions from hosting staff.`
        )
        .addFields(
          {
            name: "Started by",
            value: `${interaction.user.tag} (<@${interaction.user.id}>)`,
            inline: true,
          },
          {
            name: "Time",
            value: `<t:${Math.floor(now / 1000)}:F>`,
            inline: true,
          }
        )
        .setFooter({ text: "RDUSA | Server Startup" })
        .setTimestamp();

      // Send SSU announcement in the same channel where the command was used
      await interaction.channel.send({ embeds: [ssuEmbed] });

      // Let the command user know it was sent
      await interaction.editReply("✅ SSU announced successfully.");
    } catch (err) {
      console.error("❌ Error in /ssu:", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ There was an error while running this command.",
          flags: 64,
        });
      } else {
        await interaction.editReply(
          "❌ There was an error while running this command."
        );
      }
    }
  },
};
