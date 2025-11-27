import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getEmbedSections } from "../../utils/embedStore.js";

const EMBED_KEY = "information";
const INFO_CHANNEL_ID = "1388887221620310087";

export default {
  data: new SlashCommandBuilder()
    .setName("information")
    .setDescription("Post the USAR information embeds.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const db = client.db;
    await interaction.deferReply({ flags: 64 });

    try {
      const sections = await getEmbedSections(db, EMBED_KEY);

      if (!sections.length) {
        return interaction.editReply(
          "❌ No information sections found in the database. Ask a bot admin to insert them into `embed_sections`."
        );
      }

      const infoChannel = await interaction.client.channels
        .fetch(INFO_CHANNEL_ID)
        .catch(() => null);

      if (!infoChannel) {
        return interaction.editReply("❌ Could not find the information channel.");
      }

      for (const section of sections) {
        const embed = new EmbedBuilder()
          .setColor(
            typeof section.color === "number" ? section.color : 0x2b2d31
          )
          .setTitle(`**${section.title || `Section ${section.section_index}`}**`)
          .setDescription(section.description || "*(No description set)*")
          .setFooter({ text: `USAR Information | ${section.title || ""}` });

        await infoChannel.send({ embeds: [embed] });
      }

      await interaction.editReply("✅ Information embeds posted successfully.");
    } catch (err) {
      console.error("❌ Error posting information embeds:", err);
      await interaction.editReply("❌ Failed to post information embeds. Check console for details.");
    }
  },
};
