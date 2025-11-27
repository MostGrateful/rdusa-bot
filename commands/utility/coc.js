import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getEmbedSections } from "../../utils/embedStore.js";

const EMBED_KEY = "coc";

export default {
  data: new SlashCommandBuilder()
    .setName("coc")
    .setDescription("Post the chain of command embeds for the United States Army.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const db = client.db;
    await interaction.deferReply({ flags: 64 });

    try {
      const sections = await getEmbedSections(db, EMBED_KEY);

      if (!sections.length) {
        return interaction.editReply(
          "❌ No CoC sections found in the database. Ask a bot admin to insert them into `embed_sections`."
        );
      }

      for (const section of sections) {
        const embed = new EmbedBuilder()
          .setColor(
            typeof section.color === "number" ? section.color : 0x2b2d31
          )
          .setTitle(`**${section.title || `Section ${section.section_index}`}**`)
          .setDescription(section.description || "*(No description set)*")
          .setFooter({
            text: `United States Army | ${section.title || `Section ${section.section_index}`}`,
          });

        await interaction.channel.send({ embeds: [embed] });
      }

      await interaction.editReply("✅ Chain of Command embeds posted successfully.");
    } catch (err) {
      console.error("❌ Error posting CoC embeds:", err);
      await interaction.editReply("❌ Failed to post embeds. Check console for details.");
    }
  },
};
