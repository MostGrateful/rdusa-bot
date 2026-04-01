import { EmbedBuilder } from "discord.js";

function getTodayEasternParts() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = formatter.formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    dateKey: `${map.year}-${String(map.month).padStart(2, "0")}-${String(map.day).padStart(2, "0")}`,
  };
}

function formatMonthDay(month, day) {
  const date = new Date(Date.UTC(2024, month - 1, day));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function getBirthdayChannels(client, guild) {
  try {
    const db = client.db;
    if (!db) return [];

    const channels = [];

    const [multiRows] = await db.query(
      `
      SELECT channel_id
      FROM guild_birthday_channels
      WHERE guild_id = ?
      `,
      [guild.id]
    );

    for (const row of multiRows || []) {
      if (!row?.channel_id) continue;
      const channel = await guild.channels.fetch(row.channel_id).catch(() => null);
      if (channel) channels.push(channel);
    }

    // Legacy fallback support
    const [configRows] = await db.query(
      `
      SELECT birthday_channel_id
      FROM guild_config
      WHERE guild_id = ?
      LIMIT 1
      `,
      [guild.id]
    );

    const legacyChannelId = configRows?.[0]?.birthday_channel_id;
    if (legacyChannelId) {
      const legacyChannel = await guild.channels.fetch(legacyChannelId).catch(() => null);
      if (legacyChannel) channels.push(legacyChannel);
    }

    const unique = new Map();
    for (const channel of channels) {
      unique.set(channel.id, channel);
    }

    return [...unique.values()];
  } catch (err) {
    console.error(`❌ Birthday channel lookup failed for guild ${guild.id}:`, err);
    return [];
  }
}

export async function postDailyBirthdays(client, options = {}) {
  const db = client.db;
  if (!db) return [];

  const { month, day, dateKey } = getTodayEasternParts();
  const guildIdFilter = options.guildId || null;
  const force = options.force === true;

  const results = [];

  for (const guild of client.guilds.cache.values()) {
    if (guildIdFilter && guild.id !== guildIdFilter) continue;

    try {
      if (!force) {
        const [alreadyRows] = await db.query(
          `
          SELECT 1
          FROM birthday_daily_posts
          WHERE guild_id = ? AND post_date = ?
          LIMIT 1
          `,
          [guild.id, dateKey]
        );

        if (alreadyRows.length) {
          results.push({
            guildId: guild.id,
            success: true,
            posted: false,
            count: 0,
            channelsPosted: 0,
            reason: "Already posted today",
          });
          continue;
        }
      }

      const [birthdayRows] = await db.query(
        `
        SELECT user_id, month, day
        FROM birthdays
        WHERE guild_id = ? AND month = ? AND day = ?
        ORDER BY user_id ASC
        `,
        [guild.id, month, day]
      );

      const channels = await getBirthdayChannels(client, guild);
      if (!channels.length) {
        results.push({
          guildId: guild.id,
          success: false,
          posted: false,
          count: 0,
          channelsPosted: 0,
          reason: "No birthday channels configured",
        });
        continue;
      }

      const mentions = birthdayRows.map((row) => `<@${row.user_id}>`);

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("🎉 Today's Birthdays")
        .setFooter({ text: "RDUSA Birthday System" })
        .setTimestamp();

      if (birthdayRows.length) {
        embed.setDescription(
          `${mentions.join("\n")}\n\nHappy birthday to everyone celebrating **${formatMonthDay(month, day)}**!`
        );
      } else {
        embed.setDescription(
          `There are no birthdays listed for **${formatMonthDay(month, day)}**.`
        );
      }

      let channelsPosted = 0;

      for (const channel of channels) {
        try {
          await channel.send({ embeds: [embed] });
          channelsPosted++;
        } catch (err) {
          console.error(`❌ Failed sending birthday post to channel ${channel.id}:`, err);
        }
      }

      if (!channelsPosted) {
        results.push({
          guildId: guild.id,
          success: false,
          posted: false,
          count: birthdayRows.length,
          channelsPosted: 0,
          reason: "Failed to post in all configured channels",
        });
        continue;
      }

      if (!force) {
        await db.query(
          `
          INSERT INTO birthday_daily_posts (guild_id, post_date)
          VALUES (?, ?)
          `,
          [guild.id, dateKey]
        );
      }

      results.push({
        guildId: guild.id,
        success: true,
        posted: true,
        count: birthdayRows.length,
        channelsPosted,
        reason: null,
      });
    } catch (err) {
      console.error(`❌ Failed birthday post for guild ${guild.id}:`, err);

      results.push({
        guildId: guild.id,
        success: false,
        posted: false,
        count: 0,
        channelsPosted: 0,
        reason: err?.message || "Unknown error",
      });
    }
  }

  return results;
}

export function startBirthdayScheduler(client) {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      const now = new Date();
      const eastern = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).formatToParts(now);

      const map = Object.fromEntries(eastern.map((p) => [p.type, p.value]));
      const hour = Number(map.hour);
      const minute = Number(map.minute);

      if (hour === 0 && minute >= 0 && minute <= 5) {
        await postDailyBirthdays(client);
      }
    } catch (err) {
      console.error("❌ Birthday scheduler tick failed:", err);
    } finally {
      running = false;
    }
  };

  tick();
  setInterval(tick, 60_000);
}