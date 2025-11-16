import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Displays bot status and system information."),

  async execute(interaction, client) {
    try {
      const latency = Date.now() - interaction.createdTimestamp;
      const apiPing = client.ws.ping;

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🟢 Bot Status")
        .addFields(
          { name: "WebSocket Ping", value: `${apiPing}ms`, inline: true },
          { name: "Message Latency", value: `${latency}ms`, inline: true },
          { name: "Servers Connected", value: `${client.guilds.cache.size}`, inline: true }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (err) {
      console.error("❌ Error executing /status:", err);
      await interaction.reply({
        content: "❌ There was an error retrieving the bot status.",
        flags: 64,
      });
    }
  },
};
