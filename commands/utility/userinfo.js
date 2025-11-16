import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Displays detailed information about a user.")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Select the user to view info about.")
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`👤 User Info: ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "User Tag", value: `${user.tag}`, inline: true },
        { name: "User ID", value: `${user.id}`, inline: true },
        { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: false },
        ...(member
          ? [
              { name: "Joined Server", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false },
              { name: "Roles", value: member.roles.cache.map(r => r.toString()).join(", ") || "None", inline: false },
            ]
          : [])
      )
      .setFooter({ text: "RDUSA User Info System" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
