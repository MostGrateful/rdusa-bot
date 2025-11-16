import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("coc")
    .setDescription("Post the chain of command embeds for the United States Army.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    try {
      // ───────────────────────────────
      // 🟥 Section 1 — Cabinet
      // ───────────────────────────────
      const section1 = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle("**Section 1**")
        .setDescription(
          `### <:POTUS:1389860236084379728> **Cabinet**\n` +
          `**Commander in Chief**\n<:POTUS:1389860236084379728> President, ReaperDevCollins\n\n` +
          `**Vice Commander in Chief**\n<:VPOTUS:1389860232762490920> Vice President, jaiddkk`
        )
        .setFooter({ text: "United States Army | Section 1" });

      // ───────────────────────────────
      // 🟦 Section 2 — Executive Office
      // ───────────────────────────────
      const section2 = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("**Section 2**")
        .setDescription(
          `### <:XOPOTUS:1417239012061610004> **Executive Office of the President**\n` +
          `**National Security Advisor**\n<:XOPOTUS:1417239012061610004> Advisor, ItsOfficiaIPhantom\n\n` +
          `**Deputy National Security Advisor**\n<:XOPOTUS:1417239012061610004> Deputy Advisor, Vacant`
        )
        .setFooter({ text: "United States Army | Section 2" });

      // ───────────────────────────────
      // 🟩 Section 3 — Office of the Chief of Staff
      // ───────────────────────────────
      const section3 = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("**Section 3**")
        .setDescription(
          `### <:csaflag:1398474848648302652> **Office of the Chief of Staff**\n` +
          `**Chief of Staff of the Army**\n<:O10:1347702372960305274> General, zlpzq\n\n` +
          `**Vice Chief of Staff of the Army**\n<:O10:1347702372960305274> General, Defy_Il\n\n` +
          `**Sergeant Major of the Army**\n<:E9C:1398420212302352576> Sergeant Major of the Army, LuaPresence\n\n` +
          `**Director of Army Staff**\n<:O9:1347702371559669800> Lieutenant General, Mountainbikerd101\n\n` +
          `**Inspector General of the Army**\n<:O9:1347702371559669800> Lieutenant General, Vacant\n\n` +
          `**Judge Advocate General of The Army**\n<:O9:1347702371559669800> Lieutenant General, Madalloy9651`
        )
        .setFooter({ text: "United States Army | Section 3" });

      // ───────────────────────────────
      // 📬 Send All Sections
      // ───────────────────────────────
      await interaction.channel.send({ embeds: [section1] });
      await interaction.channel.send({ embeds: [section2] });
      await interaction.channel.send({ embeds: [section3] });

      await interaction.editReply({ content: "✅ Chain of Command embeds posted successfully." });
    } catch (error) {
      console.error("❌ Error posting CoC embeds:", error);
      await interaction.editReply({ content: "❌ Failed to post embeds. Check console for details." });
    }
  },
};
