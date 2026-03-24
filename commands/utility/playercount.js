import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";

/**
 * Get config for THIS guild
 */
async function getPlayercountConfig(db, guildId) {
  const [rows] = await db.query(
    `
    SELECT universe_id, place_id
    FROM guild_playercount_config
    WHERE guild_id = ?
    LIMIT 1
    `,
    [guildId],
  );

  if (!rows?.length) return null;

  return {
    universeId: rows[0].universe_id ? String(rows[0].universe_id) : null,
    placeId: rows[0].place_id ? String(rows[0].place_id) : null,
  };
}

/**
 * Convert placeId → universeId (if needed)
 */
async function resolveUniverseIdFromPlaceId(placeId) {
  const res = await fetch(
    `https://apis.roblox.com/universes/v1/places/${placeId}/universe`,
  );

  if (!res.ok) {
    throw new Error(`Failed to resolve universe (${res.status})`);
  }

  const data = await res.json();
  if (!data?.universeId) {
    throw new Error("No universeId returned.");
  }

  return String(data.universeId);
}

/**
 * Get Roblox game stats
 */
async function getUniverseData(universeId) {
  const res = await fetch(
    `https://games.roblox.com/v1/games?universeIds=${universeId}`,
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch Roblox game data (${res.status})`);
  }

  const data = await res.json();
  const game = data?.data?.[0];

  if (!game) {
    throw new Error("No game data found.");
  }

  return {
    name: game.name || "Unknown Game",
    playing: game.playing ?? 0,
    visits: game.visits ?? 0,
    maxPlayers: game.maxPlayers ?? null,
    rootPlaceId: game.rootPlaceId ? String(game.rootPlaceId) : null,
    universeId: String(game.id),
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName("playercount")
    .setDescription("Shows the current player count for this server's configured Roblox game."),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction
   * @param {import("discord.js").Client} client
   */
  async execute(interaction, client) {
    await interaction.deferReply();

    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.editReply("❌ This command can only be used in a server.");
    }

    const db = client.db;
    if (!db) {
      return interaction.editReply("❌ Database not available.");
    }

    const guildId = interaction.guild.id;

    try {
      // Get config for THIS server
      const config = await getPlayercountConfig(db, guildId);

      if (!config) {
        return interaction.editReply(
          "❌ Playercount is not configured for this server.",
        );
      }

      let universeId = config.universeId;

      // Convert place → universe if needed
      if (!universeId && config.placeId) {
        universeId = await resolveUniverseIdFromPlaceId(config.placeId);
      }

      if (!universeId) {
        return interaction.editReply(
          "❌ Invalid config. Add a universe_id or place_id in SQL.",
        );
      }

      // Fetch game data
      const game = await getUniverseData(universeId);

      // ✅ CLEAN EMBED (TITLE = GAME NAME)
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(game.name) // 🔥 THIS IS THE CHANGE YOU WANTED
        .setDescription("🎮 Live Player Statistics")
        .addFields(
          {
            name: "👥 Players Online",
            value: String(game.playing),
            inline: true,
          },
          {
            name: "📈 Total Visits",
            value: String(game.visits),
            inline: true,
          },
          {
            name: "🎯 Max Players",
            value: game.maxPlayers !== null
              ? String(game.maxPlayers)
              : "Unknown",
            inline: true,
          },
        )
        .setFooter({
          text: `Universe ID: ${game.universeId}`,
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ /playercount error:", err);

      return interaction.editReply(
        "❌ Failed to fetch player count for this server.",
      );
    }
  },
};