import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8-ball a question!")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("The question you want to ask the magic 8-ball.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const question = interaction.options.getString("question");

    // 🎱 Possible 8-ball answers
    const responses = [
      "It is certain.",
      "Without a doubt.",
      "Yes — definitely.",
      "You may rely on it.",
      "As I see it, yes.",
      "Most likely.",
      "Outlook good.",
      "Yes.",
      "Signs point to yes.",
      "Reply hazy, try again.",
      "Ask again later.",
      "Better not tell you now.",
      "Cannot predict now.",
      "Concentrate and ask again.",
      "Don't count on it.",
      "My reply is no.",
      "My sources say no.",
      "Outlook not so good.",
      "Very doubtful."
    ];

    // 🎯 Random response
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    // 🎨 Build embed
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("🎱 The Magic 8-Ball Has Spoken")
      .addFields(
        { name: "❓ Question", value: question },
        { name: "💬 Answer", value: randomResponse }
      )
      .setFooter({ text: `Asked by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
