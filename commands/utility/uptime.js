import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Shows how long the bot has been running."),

  async execute(interaction) {
    const totalSeconds = Math.floor(process.uptime());
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🕒 Bot Uptime")
      .setDescription(`> **Online for:** ${uptimeString}`)
      .setThumbnail(interaction.client.user.displayAvatarURL())
      .setFooter({
        text: `${interaction.client.user.username} • RDUSA Bot`,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 }); // flags = ephemeral
  },
};
