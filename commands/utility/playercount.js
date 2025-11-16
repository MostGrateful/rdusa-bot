import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";

export default {
  data: new SlashCommandBuilder()
    .setName("playercount")
    .setDescription("Check how many players are currently in the Roblox game Fort Hood: Texas."),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    try {
      const placeId = "134569330405044";
      // First get universe ID
      const uniRes = await fetch(
        `https://apis.roblox.com/universes/v1/places/${placeId}/universe`
      );
      if (!uniRes.ok) throw new Error("Failed to get universe ID");
      const uniData = await uniRes.json();
      const universeId = uniData.universeId;

      // Then get game stats
      const gameRes = await fetch(
        `https://games.roblox.com/v1/games?universeIds=${universeId}`
      );
      if (!gameRes.ok) throw new Error("Failed to get game stats");
      const gameData = await gameRes.json();
      const playing = gameData.data?.[0]?.playing ?? 0;

      const embed = new EmbedBuilder()
        .setColor(0x2b88d8)
        .setTitle("🎮 Player Count — Fort Hood: Texas")
        .setDescription(`Current players: **${playing.toLocaleString()}**`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ Error fetching player count:", err);
      await interaction.editReply({
        content: "❌ Could not fetch player count right now. Try again later.",
      });
    }
  },
};
