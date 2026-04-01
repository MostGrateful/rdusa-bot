import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

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

  return Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month];
}

function formatBirthday(month, day) {
  const date = new Date(Date.UTC(2024, month - 1, day));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Set your birthday.")
    .addIntegerOption((option) => {
      option
        .setName("month")
        .setDescription("Your birth month")
        .setRequired(true);

      for (const [name, value] of MONTH_CHOICES) {
        option.addChoices({ name, value });
      }

      return option;
    })
    .addIntegerOption((option) =>
      option
        .setName("day")
        .setDescription("Your birth day")
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

      await db.query(
        `
        INSERT INTO birthdays (user_id, guild_id, month, day)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          month = VALUES(month),
          day = VALUES(day),
          updated_at = CURRENT_TIMESTAMP
        `,
        [interaction.user.id, interaction.guild.id, month, day]
      );

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🎂 Birthday Saved")
        .setDescription(`Your birthday has been set to **${formatBirthday(month, day)}**.`)
        .setFooter({ text: "RDUSA Birthday System" })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        flags: 64,
      });
    } catch (err) {
      console.error("❌ Error in /birthday:", err);

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: "❌ An error occurred while saving your birthday.",
        });
      }

      return interaction.reply({
        content: "❌ An error occurred while saving your birthday.",
        flags: 64,
      });
    }
  },
};