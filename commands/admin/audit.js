import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("audit")
    .setDescription("Shows the last few staff actions or command logs.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    // Check permissions in case it's used outside of guild context
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "🚫 You need Administrator permissions to use this command.",
        flags: 64,
      });
    }

    const logChannelId = process.env.LOG_CHANNEL_ID_MAIN;
    const logChannel = await client.channels.fetch(logChannelId).catch(() => null);

    if (!logChannel) {
      return interaction.reply({ content: "⚠️ Log channel not found or not accessible.", flags: 64 });
    }

    const messages = await logChannel.messages.fetch({ limit: 10 }).catch(() => null);
    if (!messages) {
      return interaction.reply({ content: "⚠️ Unable to fetch logs.", flags: 64 });
    }

    const embeds = messages
      .filter(m => m.embeds.length > 0)
      .map(m => {
        const embed = m.embeds[0];
        const title = embed.title || "Unknown Action";
        const timestamp = Math.floor(m.createdTimestamp / 1000);
        const author = embed.fields?.find(f => f.name === "User")?.value || "Unknown User";
        return `• **${title}** by ${author} — <t:${timestamp}:R>`;
      });

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("📝 Recent Staff Actions")
      .setDescription(embeds.length > 0 ? embeds.join("\n") : "No recent logs found.")
      .setFooter({ text: "RDUSA Audit Log — Admin Only" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
