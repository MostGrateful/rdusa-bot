import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll a dice or any sided number!")
    .addIntegerOption(option =>
      option
        .setName("sides")
        .setDescription("Number of sides on the dice (default: 6)")
        .setMinValue(2)
        .setMaxValue(1000000)
    ),

  async execute(interaction) {
    const sides = interaction.options.getInteger("sides") || 6;
    const result = Math.floor(Math.random() * sides) + 1;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎲 Dice Roll")
      .setDescription(`You rolled a **${result}** on a ${sides}-sided die!`)
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
