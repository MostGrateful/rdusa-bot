import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("botcredits")
    .setDescription("Show information about the RDUSA Bot creator and testers."),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🤖 RDUSA Bot Credits")
      .setDescription(
        "This bot was developed to support the operations of the **United States Army (RDUSA)** community."
      )
      .addFields(
        {
          name: "👑 Bot Creator",
          value: "**James_Ashworth**\nLead Developer & Systems Architect for RDUSA Bot.",
        },
        {
          name: "🧪 Bot Testers",
          value:
            "- **hello245689**\n" +
            "- **draxvior**\n" +
            "- **Xybersynth**\n\n" +
            "These testers help ensure stability, catch bugs, and improve the user experience.",
        }
      )
      .setFooter({ text: "RDUSA Bot • Thank you for your support." })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
