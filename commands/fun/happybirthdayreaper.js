import { SlashCommandBuilder } from "discord.js";

/**
 * Get New York date safely (so Jan 13 is consistent)
 */
function getNYDateParts(date = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = dtf.formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName("happybirthdayreaper")
    .setDescription("Wish Reaper a happy birthday! (Only usable on January 13)"),

  async execute(interaction, client) {
    const db = client.db;

    try {
      const { year, month, day } = getNYDateParts();

      // 🎂 Only allow on Jan 13 (NY time)
      if (month !== 1 || day !== 13) {
        return interaction.reply({
          content: "🎂 This command can only be used on **January 13**.",
        });
      }

      const userId = interaction.user.id;

      // Try to insert wish (unique constraint prevents duplicates)
      try {
        await db.execute(
          "INSERT INTO reaper_birthday_wishes (year, user_id) VALUES (?, ?)",
          [year, userId]
        );
      } catch (err) {
        // User already wished this year
        const [rows] = await db.execute(
          "SELECT COUNT(*) AS total FROM reaper_birthday_wishes WHERE year = ?",
          [year]
        );
        const total = Number(rows[0].total);

        return interaction.reply({
          content: `🎉 You already wished Reaper happy birthday for **${year}**!\n🥳 Total wishes this year: **${total}**`,
        });
      }

      // Get updated total
      const [rows] = await db.execute(
        "SELECT COUNT(*) AS total FROM reaper_birthday_wishes WHERE year = ?",
        [year]
      );
      const total = Number(rows[0].total);

      // Public celebration message
      return interaction.reply({
        content: `🎂 **Happy Birthday, Reaper!** 🎉\nThanks for the wish, <@${userId}>!\n🥳 Total wishes for **${year}**: **${total}**`,
      });
    } catch (err) {
      console.error("Error in /happybirthdayreaper:", err);
      return interaction.reply({
        content: "❌ Something went wrong while recording your birthday wish.",
      });
    }
  },
};
