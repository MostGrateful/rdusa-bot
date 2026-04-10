import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { postDailyBirthdays } from "../../utils/birthdayPoster.js";

const MONTH_CHOICES = [
  ["January", 1],
  ["February", 2],
  ["March", 3],
  ["April", 4],
  ["May", 5],
  ["June", 6],
  ["July", 7],
  ["August", 8],
  ["September", 9],
  ["October", 10],
  ["November", 11],
  ["December", 12],
];

function isValidDay(month, day) {
  const daysInMonth = {
    1: 31,
    2: 29,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 31,
    9: 30,
    10: 31,
    11: 30,
    12: 31,
  };

  return (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month]
  );
}

function formatMonthDay(month, day) {
  const date = new Date(Date.UTC(2024, month - 1, day));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName("forcebirthdays")
    .setDescription("Force post birthdays for a chosen date to all configured birthday channels.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((option) => {
      option
        .setName("month")
        .setDescription("Month to post birthdays for")
        .setRequired(true);

      for (const [name, value] of MONTH_CHOICES) {
        option.addChoices({ name, value });
      }

      return option;
    })
    .addIntegerOption((option) =>
      option
        .setName("day")
        .setDescription("Day to post birthdays for")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(31)
    ),

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

      const month = interaction.options.getInteger("month", true);
      const day = interaction.options.getInteger("day", true);

      if (!isValidDay(month, day)) {
        return interaction.reply({
          content: "❌ That is not a valid month/day combination.",
          flags: 64,
        });
      }

      const prettyDate = formatMonthDay(month, day);

      await interaction.reply({
        content: `🎂 Forcing birthday post for **${prettyDate}** to all configured birthday channels...`,
        flags: 64,
      });

      const results = await postDailyBirthdays(client, {
        guildId: interaction.guild.id,
        force: true,
        month,
        day,
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
            name: "Date Posted",
            value: prettyDate,
            inline: true,
          },
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
          },
          {
            name: "Forced By",
            value: interaction.user.tag,
            inline: true,
          }
        )
        .setFooter({ text: "RDUSA Birthday System" })
        .setTimestamp();

      return interaction.editReply({
        content: `✅ Birthday post sent for **${prettyDate}**.`,
        embeds: [embed],
      });
    } catch (err) {
      console.error("❌ Error in /forcebirthdays:", err);

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: "❌ An error occurred while forcing the birthday post.",
        });
      }

      return interaction.reply({
        content: "❌ An error occurred while forcing the birthday post.",
        flags: 64,
      });
    }
  },
};