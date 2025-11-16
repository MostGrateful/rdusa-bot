// commands/admin/flag-user.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const { TRELLO_API_KEY, TRELLO_TOKEN } = process.env;

// Trello Personnel board
const TRELLO_BOARD_ID = "DK6WJt1g";

// Role that can use this command
const FLAG_MANAGER_ROLE_ID = "1387212542245339209";

// Mod log + Dev command log channels
const MOD_LOG_CHANNEL_ID = "1439479062572699739";
const DEV_COMMAND_LOG_CHANNEL_ID = "1388886528968622080";

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
 * You can tweak these ranges to exactly match your Trello board.
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
 * Find existing personnel card for this username (case-insensitive),
 * or create a new one in the correct list with base description.
 */
async function findOrCreateUserCard(userInfo) {
  // 1) Get all cards on the board
  const cardsRes = await fetch(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
  );
  const cards = await cardsRes.json();

  const existing = cards.find(
    (c) => c.name.toLowerCase() === userInfo.username.toLowerCase()
  );
  if (existing) return existing;

  // 2) Need to create a new card in the appropriate list
  const listsRes = await fetch(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
  );
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
        name: userInfo.username,
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
 * Returns array of label names actually attached.
 */
async function ensureLabelsForFlags(cardId, flags) {
  if (!flags.length) return [];

  // 1) Get existing labels on the board
  const labelsRes = await fetch(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&limit=1000`
  );
  const labels = await labelsRes.json();

  const attachedLabels = [];

  for (const flagNameRaw of flags) {
    const flagName = flagNameRaw.trim();
    if (!flagName) continue;

    // Find existing label by name (case-insensitive)
    let label = labels.find(
      (l) => l.name && l.name.toLowerCase() === flagName.toLowerCase()
    );

    // If not found, create a new label
    if (!label) {
      const createLabelRes = await fetch(
        `https://api.trello.com/1/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idBoard: TRELLO_BOARD_ID,
            name: flagName,
            // Trello valid colors: green, yellow, orange, red, purple, blue, sky, pink, lime, black, null
            color: "black",
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
    try {
      await fetch(
        `https://api.trello.com/1/cards/${cardId}/idLabels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&value=${label.id}`,
        { method: "POST" }
      );
      attachedLabels.push(flagName);
    } catch (err) {
      console.error("❌ Failed to attach label:", err);
    }
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

      // 2) Trello card (find or create)
      const card = await findOrCreateUserCard(userInfo);

      // 3) Ensure labels exist + attach to card
      const attachedFlags = await ensureLabelsForFlags(card.id, flagNames);

      // 4) Add Trello comment log
      const commentText =
        `Username: ${userInfo.username} (${userInfo.id})\n` +
        `Flag(s) Added: ${attachedFlags.join(", ") || "None"}\n` +
        `Reason: ${reasonInput}\n` +
        `Submitted by: ${interaction.user.tag}\n` +
        `Approved by: ${approvedByInput}`;

      await fetch(
        `https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: commentText }),
        }
      );

      // 5) Build log embed
      const logEmbed = new EmbedBuilder()
        .setColor(0xff4757)
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
            value: attachedFlags.join(", "),
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
