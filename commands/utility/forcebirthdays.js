import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { postDailyBirthdays } from "../../utils/birthdayPoster.js";

export default {
  data: new SlashCommandBuilder()
    .setName("forcebirthdays")
    .setDescription("Force post today's birthdays to all configured birthday channels.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    try {
      if (!interaction.inGuild() || !interaction.guild) {
        return interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: 64,
        });
      }

      const db = client.db;
      if (!db) {
        return interaction.reply({
          content: "❌ Database is not available.",
          flags: 64,
        });
      }

      await interaction.reply({
        content: "🎂 Forcing today's birthday post to all configured birthday channels...",
        flags: 64,
      });

      const results = await postDailyBirthdays(client, {
        guildId: interaction.guild.id,
        force: true,
      });

      const guildResult = Array.isArray(results)
        ? results.find((r) => r.guildId === interaction.guild.id)
        : null;

      if (!guildResult) {
        return interaction.editReply({
          content: "❌ No result was returned for this server.",
        });
      }

      if (!guildResult.success) {
        return interaction.editReply({
          content: `❌ Failed to post birthdays: ${guildResult.reason || "Unknown error."}`,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🎉 Birthday Post Forced")
        .addFields(
          {
            name: "Server",
            value: interaction.guild.name,
            inline: true,
          },
          {
            name: "Birthdays Found",
            value: String(guildResult.count ?? 0),
            inline: true,
          },
          {
            name: "Channels Posted",
            value: String(guildResult.channelsPosted ?? 0),
            inline: true,
          }
        )
        .setFooter({ text: "RDUSA Birthday System" })
        .setTimestamp();

      return interaction.editReply({
        content: "✅ Birthday post sent.",
        embeds: [embed],
      });
    } catch (err) {
      console.error("❌ Error in /forcebirthdays:", err);

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: "❌ An error occurred while forcing today's birthday post.",
        });
      }

      return interaction.reply({
        content: "❌ An error occurred while forcing today's birthday post.",
        flags: 64,
      });
    }
  },
};