import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("salute")
    .setDescription("Salute a fellow member or show your respect!")
    .addUserOption(option =>
      option.setName("user").setDescription("Who are you saluting?").setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user") || interaction.user;

    const gifs = [
      "https://media.tenor.com/nU8uJ1iXw70AAAAC/salute-soldier.gif",
      "https://media.tenor.com/w8pHoh4m_yIAAAAC/military-salute.gif",
      "https://media.tenor.com/K0vGrBBx__AAAAAC/salute-army.gif",
      "https://media.tenor.com/wXXnA9z13vAAAAAC/salute.gif"
    ];

    const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

    const embed = new EmbedBuilder()
      .setColor(0x2b88d8)
      .setTitle("🫡 Salute!")
      .setDescription(`**${interaction.user.username}** salutes **${target.username}**! 🇺🇸`)
      .setImage(randomGif)
      .setFooter({ text: `Respect and honor | Requested by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
