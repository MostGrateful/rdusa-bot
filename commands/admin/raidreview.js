// commands/admin/raidreview.js
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getIncidents, updateIncidentStatus } from "../../utils/raidLogger.js";

export default {
  data: new SlashCommandBuilder()
    .setName("raidreview")
    .setDescription("Review or update recent raid incidents.")
    .addIntegerOption(opt =>
      opt
        .setName("limit")
        .setDescription("How many incidents to show (default: 5)")
        .setMinValue(1)
        .setMaxValue(25)
    )
    .addStringOption(opt =>
      opt
        .setName("statusupdate")
        .setDescription("Mark a raid ID as resolved or under review (example: 1730519232 resolved)")
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 }); // ephemeral

    const limit = interaction.options.getInteger("limit") || 5;
    const statusUpdate = interaction.options.getString("statusupdate");

    try {
      const incidents = getIncidents();

      if (!incidents.length)
        return interaction.editReply("✅ No raid incidents recorded.");

      // If updating a status
      if (statusUpdate) {
        const [id, newStatus] = statusUpdate.split(" ");
        if (!id || !newStatus)
          return interaction.editReply("⚠️ Format: `<incidentID> <status>` (e.g., `1730519232 resolved`)");

        const success = updateIncidentStatus(Number(id), newStatus);
        return interaction.editReply(
          success
            ? `✅ Updated incident **${id}** → **${newStatus}**`
            : `❌ Could not find incident ID ${id}`
        );
      }

      // Otherwise show incidents
      const recent = incidents.slice(-limit).reverse();
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🧩 Recent Raid Incidents")
        .setDescription(`Showing the latest **${recent.length}** incidents:`)
        .setFooter({ text: "RDUSA Bot Raid Review System" })
        .setTimestamp();

      for (const i of recent) {
        embed.addFields({
          name: `🕓 ${new Date(i.timestamp).toLocaleString()} • ID: ${i.id}`,
          value:
            `**Type:** ${i.type}\n` +
            `**Guild:** ${i.guildName}\n` +
            `**Detected by:** ${i.detectedBy}\n` +
            `**Users Flagged:** ${i.count}\n` +
            `**Status:** ${i.status}`,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ Error reading raid logs:", err);
      await interaction.editReply("❌ Failed to read raid log file.");
    }
  },
};
