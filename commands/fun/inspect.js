import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("inspect")
    .setDescription("Inspect a user to determine their 'status'.")
    .addUserOption(option =>
      option.setName("user").setDescription("Who do you want to inspect?").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user");

    const statuses = [
      "✅ Status: **Legendary Operative**",
      "🛠️ Status: **Under Maintenance**",
      "🚫 Status: **Classified - Access Denied**",
      "🎖️ Status: **Elite Member of RDUSA**",
      "💤 Status: **Currently AFK on Duty**",
      "🧠 Status: **Too Smart to Inspect**",
      "🤖 Status: **Definitely a Bot**",
      "💣 Status: **Mission Active**",
      "👑 Status: **Superior Officer**",
      "⚠️ Status: **Suspicious Activity Detected**"
    ];

    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("🔍 RDUSA Inspection Report")
      .setDescription(
        `**Inspecting:** ${target}\n**Inspector:** ${interaction.user}\n\n${randomStatus}`
      )
      .setFooter({ text: "Inspection completed successfully." })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
