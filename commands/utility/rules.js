import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getEmbedSections } from "../../utils/embedStore.js";

const EMBED_KEY = "rules";
const RULES_CHANNEL_ID = "1347436771444523089";

export default {
  data: new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Post the server rules embed in the rules channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const db = client.db;
    await interaction.deferReply({ flags: 64 });

    try {
      const sections = await getEmbedSections(db, EMBED_KEY);

      if (!sections.length) {
        return interaction.editReply(
          "❌ No rules sections found in the database. Ask a bot admin to insert them into `embed_sections`."
        );
      }

      const rulesChannel = await interaction.client.channels
        .fetch(RULES_CHANNEL_ID)
        .catch(() => null);

      if (!rulesChannel) {
        return interaction.editReply("❌ Could not find the rules channel.");
      }

      // Header text above the embed(s)
      await rulesChannel.send(
        "✅ By joining this server you have automatically agreed to the rules listed."
      );

      for (const section of sections) {
        const embed = new EmbedBuilder()
          .setColor(
            typeof section.color === "number" ? section.color : 0x2b2d31
          )
          .setTitle(`**${section.title || `Section ${section.section_index}`}**`)
          .setDescription(section.description || "*(No description set)*")
          .setFooter({ text: `Server Rules | ${section.title || ""}` });

        await rulesChannel.send({ embeds: [embed] });
      }

      await interaction.editReply("✅ Rules embed(s) posted successfully.");
    } catch (err) {
      console.error("❌ Error posting rules embeds:", err);
      await interaction.editReply("❌ Failed to post rules embeds. Check console for details.");
    }
  },
};
