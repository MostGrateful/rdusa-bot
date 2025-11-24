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
          `### <:jcos:1439850733351735368> **Office of Joint Chiefs of Staff**\n` +
          `**Chairman of the Joint Chiefs of Staff**\n<:CJCSFlag:1439849441883459664> Chairman, ReaperDevCollins\n\n` +
          `**Vice Chairman of the Joint Chiefs of Staff**\n<:VCJCSFlag:1439849522456166471>  Vice Chairman, jaiddkk`
        )
        .setFooter({ text: "United States Army | Section 1" });

      // ───────────────────────────────
      // 🟦 Section 2 — Executive Office
      // ───────────────────────────────
      const section2 = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("**Section 2**")
        .setDescription(
          `### <:SEACFlag:1439849668052910251> **Advisor Office of the Joint Chiefs of Staff**\n` +
          `**Senior Enlisted Advisor to the Chairman**\n<:SEACFlag:1439849668052910251> Advisor, ItsOfficiaIPhantom\n\n` 
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
      // 🟨 Section 4 — Office of Community Staff
      // ───────────────────────────────
      const section4 = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("**Section 4**")
        .setDescription(
          `## <:Staff:1386578212531732531> **Office of Community Staff**\n\n` +
          `**Community Staff Leadership**\n` +
          `<:CM:1371116692448743454> Director, LuaPresence\n` +
          `<:CM:1371116692448743454> Deputy Director, VortexInception\n\n` +
          `**Head of Department**\n` +
          `<:SeniorStaff:1386577957899997294> Director of Moderation, mountainbikenerd101\n` +
          `<:SeniorStaff:1386577957899997294> Director of Public Relations, Vacant\n\n` +
          `**Deputy Head of Department**\n` +
          `<:SeniorStaff:1386577957899997294> Deputy Director of Moderation, Vacant\n` +
          `<:SeniorStaff:1386577957899997294> Deputy Director of Public Relations, Vacant\n\n` 
        )
        .setFooter({ text: "United States Army | Section 4" });

      // ───────────────────────────────
      // 🟪 Section 5 — Office of Development
      // ───────────────────────────────
      const section5 = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("**Section 5**")
        .setDescription(
          `## <:FUTCOM:1432939435150020730> **Office of Development**\n\n` +
          `**Development Leadership**\n` +
          `<:headdeve:1442350757881053236> Head Developer, PhoenixInception\n` +
          `<:aheaddev:1442350699278237747> Assistant Developer & Bot Developer, James_Ashworth\n\n` +
          `**Development Team**\n` +
          `<:developer:1442350728298364972> Developer, Draxvonz\n` +
          `<:trialdev:1442350585100763308>Trial Developer, Pdanielv0813alt\n` +
          `<:trialdev:1442350585100763308> Trial Developer, Hello463`
        )
        .setFooter({ text: "United States Army | Section 5" });

      // ───────────────────────────────
      // 📬 Send All Sections
      // ───────────────────────────────
      await interaction.channel.send({ embeds: [section1] });
      await interaction.channel.send({ embeds: [section2] });
      await interaction.channel.send({ embeds: [section3] });
      await interaction.channel.send({ embeds: [section4] });
      await interaction.channel.send({ embeds: [section5] });

      await interaction.editReply({ content: "✅ Chain of Command embeds posted successfully." });
    } catch (error) {
      console.error("❌ Error posting CoC embeds:", error);
      await interaction.editReply({ content: "❌ Failed to post embeds. Check console for details." });
    }
  },
};
