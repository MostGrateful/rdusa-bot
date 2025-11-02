import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),

  async execute(interaction) {
    // Send initial message
    await interaction.reply({ content: 'Pinging...' });

    // Fetch the message that was just sent
    const sent = await interaction.fetchReply();

    // Calculate latency
    const latency = sent.createdTimestamp - interaction.createdTimestamp;

    // Edit the reply with latency info
    await interaction.editReply(`🏓 Pong! Round-trip latency: ${latency} ms.`);
  },
};
