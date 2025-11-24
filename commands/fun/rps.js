import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

const choices = ["rock", "paper", "scissors"];

function getResult(playerChoice, botChoice) {
  if (playerChoice === botChoice) return "draw";
  if (
    (playerChoice === "rock" && botChoice === "scissors") ||
    (playerChoice === "paper" && botChoice === "rock") ||
    (playerChoice === "scissors" && botChoice === "paper")
  ) {
    return "win";
  }
  return "lose";
}

export default {
  data: new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Play Rock, Paper, Scissors against the bot!"),

  async execute(interaction) {
    // Initial message
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🪨📄✂️ Rock, Paper, Scissors")
      .setDescription("Choose your move using the buttons below.")
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("rps_rock")
        .setLabel("🪨 Rock")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("rps_paper")
        .setLabel("📄 Paper")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("rps_scissors")
        .setLabel("✂️ Scissors")
        .setStyle(ButtonStyle.Primary)
    );

    const message = await interaction.reply({
      embeds: [embed],
      components: [row],
    });

    const collector = message.createMessageComponentCollector({
      time: 60_000, // 60s
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({
          content: "This isn’t your game of RPS!",
          flags: 64,
        });
      }

      await btn.deferUpdate();

      const playerChoice = btn.customId.replace("rps_", ""); // rock/paper/scissors
      const botChoice = choices[Math.floor(Math.random() * choices.length)];
      const result = getResult(playerChoice, botChoice);

      let resultText = "";
      if (result === "win") resultText = "🎉 You **won**!";
      else if (result === "lose") resultText = "😢 You **lost**!";
      else resultText = "🤝 It's a **draw**!";

      const resultEmbed = new EmbedBuilder()
        .setColor(
          result === "win" ? 0x57f287 : result === "lose" ? 0xed4245 : 0xf1c40f
        )
        .setTitle("🪨📄✂️ Rock, Paper, Scissors")
        .addFields(
          { name: "Your choice", value: `**${playerChoice}**`, inline: true },
          { name: "Bot's choice", value: `**${botChoice}**`, inline: true }
        )
        .setDescription(resultText)
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      collector.stop("played");
      await message.edit({ embeds: [resultEmbed], components: [] });
    });

    collector.on("end", async (collected, reason) => {
      if (reason !== "played") {
        // Time expired without playing
        const timeoutEmbed = EmbedBuilder.from(embed).setDescription(
          "⏰ Game expired. You didn’t make a move in time."
        );
        await message.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => null);
      }
    });
  },
};
