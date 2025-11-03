import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("motivation")
    .setDescription("Get a motivational quote to boost your day!"),

  async execute(interaction) {
    const quotes = [
      "“Discipline is doing what needs to be done, even if you don’t want to do it.”",
      "“Pain is temporary. Pride is forever.”",
      "“Success is not for the lazy.”",
      "“Push yourself, because no one else is going to do it for you.”",
      "“Don’t watch the clock; do what it does. Keep going.”",
      "“Failure is simply the opportunity to begin again, this time more intelligently.”",
      "“Every champion was once a contender that refused to give up.”",
      "“If you want it, earn it.”",
      "“You miss 100% of the shots you don’t take.”",
      "“Stay low, go fast. Kill first, die last. One shot, one kill. No luck, all skill.”"
    ];

    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("💬 RDUSA Motivation")
      .setDescription(randomQuote)
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
