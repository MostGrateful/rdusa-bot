import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin and see if it's heads or tails!"),

  async execute(interaction) {
    const outcomes = ["Heads", "Tails"];
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];

    const embed = new EmbedBuilder()
      .setColor(result === "Heads" ? 0x57f287 : 0xed4245)
      .setTitle("🪙 Coin Flip")
      .setDescription(`The coin landed on **${result}!**`)
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
