import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("guess")
    .setDescription("Play a number guessing game.")
    .addIntegerOption((opt) =>
      opt
        .setName("max")
        .setDescription("Maximum number (default: 100)")
        .setRequired(false)
        .setMinValue(10)
        .setMaxValue(10_000)
    ),

  async execute(interaction) {
    const max = interaction.options.getInteger("max") ?? 100;
    const secret = Math.floor(Math.random() * max) + 1;

    const startEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🔢 Number Guessing Game")
      .setDescription(
        `I’ve picked a number between **1** and **${max}**.\n` +
          `Type your guesses in this channel! You have **60 seconds**.`
      )
      .setFooter({ text: `Only guesses from ${interaction.user.tag} will count.` })
      .setTimestamp();

    await interaction.reply({ embeds: [startEmbed] });

    const filter = (msg) =>
      msg.author.id === interaction.user.id &&
      !msg.author.bot &&
      !isNaN(parseInt(msg.content.trim(), 10));

    const collector = interaction.channel.createMessageCollector({
      filter,
      time: 60_000,
    });

    let attempts = 0;
    let guessedCorrectly = false;

    collector.on("collect", async (msg) => {
      const guess = parseInt(msg.content.trim(), 10);
      if (isNaN(guess)) return;

      attempts++;

      if (guess === secret) {
        guessedCorrectly = true;
        collector.stop("guessed");

        const winEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("🎉 Correct!")
          .setDescription(
            `You guessed the number **${secret}** correctly in **${attempts}** attempt(s)!`
          )
          .setFooter({ text: "Number Guessing Game" })
          .setTimestamp();

        await interaction.followUp({ content: `<@${interaction.user.id}>`, embeds: [winEmbed] });
      } else if (guess < secret) {
        await msg.reply("📉 Too low! Try a higher number.").catch(() => null);
      } else if (guess > secret) {
        await msg.reply("📈 Too high! Try a lower number.").catch(() => null);
      }
    });

    collector.on("end", async (collected, reason) => {
      if (!guessedCorrectly) {
        const failEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("⌛ Time’s Up!")
          .setDescription(
            `You didn’t guess the number in time.\nThe correct number was **${secret}**.`
          )
          .setFooter({ text: "Number Guessing Game" })
          .setTimestamp();

        await interaction.followUp({
          content: `<@${interaction.user.id}>`,
          embeds: [failEmbed],
        }).catch(() => null);
      }
    });
  },
};
