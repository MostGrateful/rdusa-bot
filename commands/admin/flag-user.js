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
 * Fast local Roblox username validation
 */
function isValidRobloxUsername(username) {
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 20) return false;
  return /^[A-Za-z0-9_]+$/.test(trimmed);
}

/**
 * True Roblox validation using Roblox API
 */
async function validateRobloxUsername(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username] }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data.data?.[0] || null; // null = invalid username
}

/**
 * Get Roblox user by username after validating it
 */
async function fetchRobloxUser(username) {
  const user = await validateRobloxUsername(username);
  if (!user) return null;

  const profileRes = await fetch(
    `https://users.roblox.com/v1/users/${user.id}`
  );
  if (!profileRes.ok) return null;

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
 * Find or create Trello Card using correct naming:
 * Username (RobloxID)
 */
async function findOrCreateUserCard(userInfo) {
  const cardsRes = await fetch(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_SHORTLINK}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
  );
  const cards = await cardsRes.json();

  const desiredName = `${userInfo.username} (${userInfo.id})`.toLowerCase();
  const plainName = userInfo.username.toLowerCase();

  let existing =
    cards.find(c => c.name && c.name.toLowerCase() === desiredName) ||
    cards.find(c => c.name && c.name.toLowerCase() === plainName);

  // If card named only "Username" exists → rename it
  if (existing && existing.name.toLowerCase() === plainName) {
    await fetch(
      `https://api.trello.com/1/cards/${existing.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${userInfo.username} (${userInfo.id})`,
        }),
      }
    );
    existing.name = `${userInfo.username} (${userInfo.id})`;
  }

  if (existing) return existing;

  // Create new card in proper list
  const listsRes = await fetch(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_SHORTLINK}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
  );
  const lists = await listsRes.json();

  const listName = getListNameForUsername(userInfo.username);
  const targetList =
    lists.find(l => l.name.toUpperCase() === listName.toUpperCase()) || lists[0];

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

  return await createRes.json();
}

/**
 * Ensure labels exist + attach them to the card
 * - Case-insensitive match for existing labels
 * - Checks if label is already on the card before attaching
 */
async function ensureLabelsForFlags(cardId, flags) {
  // Board labels (cache for matching/creating)
  const labelsRes = await fetch(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&limit=1000`
  );
  const labels = await labelsRes.json();

  // Card labels (avoid duplicates)
  const cardLabelsRes = await fetch(
    `https://api.trello.com/1/cards/${cardId}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&limit=1000`
  );
  const cardLabels = await cardLabelsRes.json();

  const attached = [];

  for (const flag of flags) {
    const flagName = flag.trim();
    if (!flagName) continue;

    // ✅ Find existing label case-insensitive
    let label = labels.find(l => (l.name || "").toLowerCase() === flagName.toLowerCase());

    // ✅ Create label if missing
    if (!label) {
      const createRes = await fetch(
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
      label = await createRes.json();
      // Keep local list up to date to prevent duplicate creates in same run
      labels.push(label);
    }

    // ✅ If the card already has this label (case-insensitive by ID), skip attaching
    const alreadyOnCard = cardLabels.some(cl => cl.id === label.id);
    if (!alreadyOnCard) {
      await fetch(
        `https://api.trello.com/1/cards/${cardId}/idLabels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&value=${label.id}`,
        { method: "POST" }
      );
      cardLabels.push(label);
    }

    attached.push(flagName);
  }

  return attached;
}

/**
 * Send log embed to mod log channel and dev command log channel (if available)
 */
async function sendLogEmbeds(interaction, embed) {
  try {
    const modChannel = await interaction.client.channels.fetch(MOD_LOG_CHANNEL_ID).catch(() => null);
    if (modChannel) {
      await modChannel.send({ embeds: [embed] }).catch(() => null);
    }
  } catch {}

  try {
    const devChannel = await interaction.client.channels.fetch(DEV_COMMAND_LOG_CHANNEL_ID).catch(() => null);
    if (devChannel) {
      await devChannel.send({ embeds: [embed] }).catch(() => null);
    }
  } catch {}
}

export default {
  data: new SlashCommandBuilder()
    .setName("flag-user")
    .setDescription("Add one or more Trello flags (labels) to a user's personnel record.")
    .addStringOption(opt =>
      opt
        .setName("username")
        .setDescription("Roblox username to flag")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("flags")
        .setDescription("Flag name(s), separated by commas.")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("reason")
        .setDescription("Reason for flagging the user.")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("approved_by")
        .setDescription("Approver name (text only)")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    // Permission check
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(FLAG_MANAGER_ROLE_ID)) {
      return interaction.editReply("❌ You do not have permission to use this command.");
    }

    const username = interaction.options.getString("username").trim();
    const flagsInput = interaction.options.getString("flags").trim();
    const reason = interaction.options.getString("reason").trim();
    const approvedBy = interaction.options.getString("approved_by").trim();

    // 1️⃣ Local validation
    if (!isValidRobloxUsername(username)) {
      return interaction.editReply(
        "❌ Invalid Roblox username.\n" +
          "Usernames must be **3–20 characters** and contain **only letters, numbers, and underscores**."
      );
    }

    // 2️⃣ Roblox API validation
    const userInfo = await fetchRobloxUser(username);
    if (!userInfo) {
      return interaction.editReply(`❌ No Roblox user found with the name **${username}**.`);
    }

    const flags = flagsInput
      .split(",")
      .map(f => f.trim())
      .filter(f => f.length > 0);

    if (!flags.length) {
      return interaction.editReply("❌ You must specify at least one flag.");
    }

    try {
      // Shared card naming with backgroundcheck.js
      const card = await findOrCreateUserCard(userInfo);

      // Create/attach labels (case-insensitive + no duplicates on card)
      const attachedFlags = await ensureLabelsForFlags(card.id, flags);

      // Trello comment
      const commentText =
        `Username: ${userInfo.username}\n` +
        `Flag(s) Added: ${attachedFlags.length ? attachedFlags.join(", ") : "None"}\n` +
        `Reason: ${reason}\n` +
        `Submitted by: ${interaction.user.tag}\n` +
        `Approved by: ${approvedBy}\n` +
        `Date: ${new Date().toUTCString()}`;

      const commentUrl =
        `https://api.trello.com/1/cards/${card.id}/actions/comments` +
        `?key=${TRELLO_API_KEY}` +
        `&token=${TRELLO_TOKEN}` +
        `&text=${encodeURIComponent(commentText)}`;

      await fetch(commentUrl, { method: "POST" });

      // Log embed
      const logEmbed = new EmbedBuilder()
        .setColor(0xffd32a)
        .setTitle("🚩 User Flag Added")
        .addFields(
          { name: "Roblox Username", value: userInfo.username, inline: true },
          { name: "Roblox ID", value: String(userInfo.id), inline: true },
          {
            name: "Flags Added",
            value: attachedFlags.length ? attachedFlags.join(", ") : "None",
            inline: false,
          },
          { name: "Reason", value: reason, inline: false },
          { name: "Submitted By", value: interaction.user.tag, inline: true },
          { name: "Approved By", value: approvedBy, inline: true }
        )
        .setTimestamp();

      // ✅ Send logs to <#1439479062572699739> and also dev log if available
      await sendLogEmbeds(interaction, logEmbed);

      await interaction.editReply(
        `✅ Added flag(s) **${attachedFlags.join(", ")}** to **${userInfo.username}**.`
      );
    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ An error occurred while processing the flag.");
    }
  },
};
