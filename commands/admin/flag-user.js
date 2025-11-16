// commands/admin/flag-user.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const {
  TRELLO_API_KEY,
  TRELLO_TOKEN,
  TRELLO_BOARD_SHORTLINK, // shortlink: DK6WJt1g
  TRELLO_BOARD_ID,        // real board id: 60b747b8f127c90bdec5ca84
} = process.env;

// Role that can use this command
const FLAG_MANAGER_ROLE_ID = "1387212542245339209";

// Mod log + Dev command log channels
const MOD_LOG_CHANNEL_ID = "1439479062572699739";
const DEV_COMMAND_LOG_CHANNEL_ID = "1388886528968622080";

/**
 * Basic Roblox username validation
 */
function isValidRobloxUsername(username) {
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 20) return false;
  return /^[A-Za-z0-9_]+$/.test(trimmed);
}

/**
 * Get Roblox user by username
 */
async function fetchRobloxUser(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username] }),
  });

  if (!res.ok) {
    throw new Error(`Roblox username lookup failed (${res.status})`);
  }

  const data = await res.json();
  const user = data?.data?.[0];
  if (!user) return null;

  const profileRes = await fetch(
    `https://users.roblox.com/v1/users/${user.id}`
  );
  if (!profileRes.ok) {
    throw new Error(`Roblox profile lookup failed (${profileRes.status})`);
  }
  const profile = await profileRes.json();

  return {
    id: user.id,
    username: user.name,
    displayName: user.displayName,
    joinDate: new Date(profile.created),
  };
}

/**
 * Decide which list a user should be filed under (A-C, D-F, etc.)
 */
function getListNameForUsername(username) {
  const first = username[0]?.toUpperCase() || "A";
  if ("ABC".includes(first)) return "A-C";
  if ("DEF".includes(first)) return "D-F";
  if ("GHI".includes(first)) return "G-I";
  if ("JKL".includes(first)) return "J-L";
  if ("MNO".includes(first)) return "M-O";
  if ("PQR".includes(first)) return "P-R";
  if ("STU".includes(first)) return "S-U";
  return "V-Z";
}

/**
 * Find the existing personnel card for this user or create one.
 * IMPORTANT: uses the SAME naming convention as /backgroundcheck:
 *   "<Username> (<RobloxID>)"
 *
 * If an older card exists with just "Username", it will be renamed
 * to "Username (RobloxID)" so things stay consistent.
 */
async function findOrCreateUserCard(userInfo) {
  // 1) Get all cards on the board (using shortlink)
  const cardsRes = await fetch(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_SHORTLINK}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
  );
  if (!cardsRes.ok) {
    const txt = await cardsRes.text();
    throw new Error(`Failed to fetch Trello cards: ${txt}`);
  }
  const cards = await cardsRes.json();

  const desiredName = `${userInfo.username} (${userInfo.id})`.toLowerCase();
  const plainName = userInfo.username.toLowerCase();

  // Try to find an existing card with the standardized name
  let existing = cards.find(
    (c) => c.name && c.name.toLowerCase() === desiredName
  );

  // If not found, also accept an older card named just "Username"
  if (!existing) {
    existing = cards.find(
      (c) => c.name && c.name.toLowerCase() === plainName
    );
    // If we found a "plain username" card, rename it to the standard form
    if (existing) {
      await fetch(
        `https://api.trello.com/1/cards/${existing.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${userInfo.username} (${userInfo.id})` }),
        }
      ).catch(() => null);
      existing.name = `${userInfo.username} (${userInfo.id})`;
    }
  }

  if (existing) {
    return existing;
  }

  // 2) Need to create a new card in the appropriate list
  const listsRes = await fetch(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_SHORTLINK}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
  );
  if (!listsRes.ok) {
    const txt = await listsRes.text();
    throw new Error(`Failed to fetch Trello lists: ${txt}`);
  }
  const lists = await listsRes.json();

  const listName = getListNameForUsername(userInfo.username);
  let targetList =
    lists.find((l) => l.name.toUpperCase() === listName.toUpperCase()) ||
    lists[0];

  const desc =
    `Roblox Username: ${userInfo.username}\n` +
    `Display Name: ${userInfo.displayName}\n` +
    `Roblox ID: ${userInfo.id}\n` +
    `Join Date: ${userInfo.joinDate.toLocaleDateString()}`;

  const createRes = await fetch(
    `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idList: targetList.id,
        name: `${userInfo.username} (${userInfo.id})`,
        desc,
      }),
    }
  );

  if (!createRes.ok) {
    const errTxt = await createRes.text();
    throw new Error(`Failed to create Trello card: ${errTxt}`);
  }

  return await createRes.json();
}

/**
 * Ensure labels exist for each flag and attach them to the card.
 * Uses REAL board ID for label creation.
 * Returns array of label names actually attached.
 */
async function ensureLabelsForFlags(cardId, flags) {
  if (!flags.length) return [];

  // 1) Get existing labels on the REAL board
  const labelsRes = await fetch(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&limit=1000`
  );
  if (!labelsRes.ok) {
    const txt = await labelsRes.text();
    console.error("❌ Failed to fetch labels:", txt);
    return [];
  }
  const labels = await labelsRes.json();

  const attachedLabels = [];

  for (const raw of flags) {
    const flagName = raw.trim();
    if (!flagName) continue;

    // Find existing label by name (case-insensitive)
    let label = labels.find(
      (l) => l.name && l.name.toLowerCase() === flagName.toLowerCase()
    );

    // If not found, create a new yellow label
    if (!label) {
      const createLabelRes = await fetch(
        `https://api.trello.com/1/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idBoard: TRELLO_BOARD_ID,
            name: flagName,
            color: "yellow",
          }),
        }
      );

      if (!createLabelRes.ok) {
        const errTxt = await createLabelRes.text();
        console.error("❌ Failed to create label:", errTxt);
        continue;
      }
      label = await createLabelRes.json();
    }

    // Attach label to card
    const attachRes = await fetch(
      `https://api.trello.com/1/cards/${cardId}/idLabels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&value=${label.id}`,
      { method: "POST" }
    );

    if (!attachRes.ok) {
      const txt = await attachRes.text();
      console.error("❌ Failed to attach label:", txt);
      continue;
    }

    attachedLabels.push(flagName);
  }

  return attachedLabels;
}

export default {
  data: new SlashCommandBuilder()
    .setName("flag-user")
    .setDescription("Add one or more flags (Trello labels) to a user's personnel record.")
    .addStringOption((opt) =>
      opt
        .setName("username")
        .setDescription("Roblox username to flag.")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("flags")
        .setDescription("Flag name(s), separated by commas.")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for adding the flag(s).")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("approved_by")
        .setDescription("Who approved this flag (text only, no mentions).")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    // Permission check
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(FLAG_MANAGER_ROLE_ID)) {
      return interaction.editReply(
        "🚫 You do not have permission to use this command."
      );
    }

    const usernameInput = interaction.options.getString("username").trim();
    const flagsInput = interaction.options.getString("flags").trim();
    const reasonInput = interaction.options.getString("reason").trim();
    const approvedByInput = interaction.options.getString("approved_by").trim();

    // Local Roblox username validation
    if (!isValidRobloxUsername(usernameInput)) {
      return interaction.editReply(
        "❌ That doesn’t look like a valid Roblox username.\n" +
          "Usernames must be 3–20 characters and can only contain letters, numbers, and underscores."
      );
    }

    if (!flagsInput) {
      return interaction.editReply("🚫 You must specify at least one flag.");
    }

    const flagNames = flagsInput
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    if (!flagNames.length) {
      return interaction.editReply("🚫 You must specify at least one valid flag.");
    }

    try {
      // 1) Roblox user info
      const userInfo = await fetchRobloxUser(usernameInput);
      if (!userInfo) {
        return interaction.editReply(
          `❌ Could not find a Roblox user named **${usernameInput}**.`
        );
      }

      // 2) Trello card (find or create, shared with /backgroundcheck)
      const card = await findOrCreateUserCard(userInfo);

      // 3) Ensure labels exist + attach to card
      const attachedFlags = await ensureLabelsForFlags(card.id, flagNames);

      // 4) Build Trello comment (your format)
      const commentText =
        `Username: ${userInfo.username}\n` +
        `Flag(s) Added: ${
          attachedFlags.length ? attachedFlags.join(", ") : "None"
        }\n` +
        `Reason: ${reasonInput}\n` +
        `Submitted by: ${interaction.user.tag}\n` +
        `Approved by: ${approvedByInput || "N/A"}\n` +
        `Date: ${new Date().toUTCString()}`;

      const commentUrl =
        `https://api.trello.com/1/cards/${card.id}/actions/comments` +
        `?key=${TRELLO_API_KEY}` +
        `&token=${TRELLO_TOKEN}` +
        `&text=${encodeURIComponent(commentText)}`;

      await fetch(commentUrl, { method: "POST" }).catch((err) =>
        console.error("❌ Failed to create Trello comment:", err)
      );

      // 5) Build log embed
      const logEmbed = new EmbedBuilder()
        .setColor(0xffd32a)
        .setTitle("🚩 User Flag Added")
        .addFields(
          {
            name: "Roblox Username",
            value: userInfo.username,
            inline: true,
          },
          {
            name: "Roblox ID",
            value: String(userInfo.id),
            inline: true,
          },
          {
            name: "Flags Added",
            value: attachedFlags.length
              ? attachedFlags.join(", ")
              : "None (label attach failed)",
            inline: false,
          },
          {
            name: "Reason",
            value: reasonInput || "No reason provided.",
            inline: false,
          },
          {
            name: "Submitted by",
            value: interaction.user.tag,
            inline: true,
          },
          {
            name: "Approved by",
            value: approvedByInput || "N/A",
            inline: true,
          }
        )
        .setTimestamp();

      // 6) Send mod log
      const modLogChannel = await interaction.client.channels
        .fetch(MOD_LOG_CHANNEL_ID)
        .catch(() => null);
      if (modLogChannel) {
        await modLogChannel.send({ embeds: [logEmbed] }).catch(() => null);
      }

      // 7) Send dev command log
      const devCmdLogChannel = await interaction.client.channels
        .fetch(DEV_COMMAND_LOG_CHANNEL_ID)
        .catch(() => null);
      if (devCmdLogChannel) {
        const devEmbed = EmbedBuilder.from(logEmbed).setFooter({
          text: `Command: /flag-user • Guild: ${interaction.guild.name}`,
        });
        await devCmdLogChannel.send({ embeds: [devEmbed] }).catch(() => null);
      }

      // 8) Confirm to user
      await interaction.editReply(
        `✅ Added flag(s) **${attachedFlags.join(
          ", "
        )}** to **${userInfo.username}** and logged it to Trello.`
      );
    } catch (err) {
      console.error("❌ Error in /flag-user:", err);
      await interaction.editReply(
        "❌ An error occurred while processing this flag."
      );
    }
  },
};
