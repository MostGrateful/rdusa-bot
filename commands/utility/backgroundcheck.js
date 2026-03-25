import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const {
  TRELLO_API_KEY,
  TRELLO_TOKEN,
  TRELLO_BOARD_SHORTLINK,
  TRELLO_BOARD_ID,
  TRELLO_LIST_BLACKLIST,

  MOD_LOG_CHANNEL_ID,

  ROTECTOR_API_KEY,
  ROTECTOR_BASE_URL = "https://roscoe.rotector.com",
  ROTECTOR_AUTH_HEADER = "Authorization",
  ROTECTOR_AUTH_PREFIX = "Bearer ",
  ROTECTOR_USER_STATUS_PATH = "/v1/lookup/roblox/user/:id",
  ROTECTOR_GROUP_STATUS_PATH = "/api/groups/:id",
} = process.env;

const MAX_GROUPS_TO_CHECK_WITH_ROTECTOR = 25;

function normalizeLabelName(name) {
  return String(name || "").trim().toLowerCase();
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function chunkText(items, fallback = "None", maxLen = 1024) {
  if (!items || !items.length) return [fallback];

  const safeItems = Array.isArray(items) ? items : [items];
  const out = [];
  let current = "";

  for (const item of safeItems) {
    const line = String(item ?? "").trim();
    if (!line) continue;

    if ((current + "\n" + line).length > maxLen) {
      if (current) out.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }

  if (current) out.push(current);
  return out.length ? out : [fallback];
}

async function safeFetchJson(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;

  try {
    data = await res.json();
  } catch {
    try {
      data = await res.text();
    } catch {
      data = null;
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

async function sendModLog(interaction, embed) {
  try {
    if (!MOD_LOG_CHANNEL_ID) return;

    const channel = await interaction.client.channels.fetch(MOD_LOG_CHANNEL_ID).catch(() => null);
    if (channel) {
      await channel.send({ embeds: [embed] }).catch(() => null);
    }
  } catch {
    // ignore
  }
}

async function canUseBackgroundCheck(client, guildId, member) {
  const db = client.db;
  if (!db || !guildId || !member) return false;

  try {
    const [rows] = await db.query(
      `
      SELECT role_id
      FROM guild_backgroundcheck_perms
      WHERE guild_id = ? AND enabled = 1
      `,
      [guildId]
    );

    const allowedRoleIds = (rows || []).map((r) => String(r.role_id)).filter(Boolean);
    if (!allowedRoleIds.length) return false;

    return member.roles.cache.some((role) => allowedRoleIds.includes(role.id));
  } catch (err) {
    console.error("❌ canUseBackgroundCheck SQL error:", err);
    return false;
  }
}

async function fetchRobloxUserByUsername(username) {
  const lookupRes = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: false,
    }),
  });

  const lookupData = await lookupRes.json();
  return lookupData?.data?.[0] || null;
}

async function fetchRobloxProfile(userId) {
  const res = await safeFetchJson(`https://users.roblox.com/v1/users/${userId}`);
  if (!res.ok || !res.data) {
    throw new Error(`Failed to fetch Roblox profile for ${userId}.`);
  }
  return res.data;
}

async function fetchRobloxGroups(userId) {
  const res = await safeFetchJson(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
  if (!res.ok || !res.data) return [];

  return safeArray(res.data.data).map((entry) => ({
    groupId: entry?.group?.id,
    groupName: entry?.group?.name || "Unknown Group",
    roleName: entry?.role?.name || "Unknown Role",
  }));
}

async function getBoardLists() {
  const res = await safeFetchJson(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_SHORTLINK}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
  );

  if (!res.ok || !Array.isArray(res.data)) {
    throw new Error("Failed to fetch board lists.");
  }

  return res.data;
}

function getAlphabeticalBucket(username) {
  const firstChar = String(username || "").charAt(0).toUpperCase();

  const ranges = {
    "0-9": /^[0-9]/,
    "A-C": /^[A-C]/,
    "D-F": /^[D-F]/,
    "G-I": /^[G-I]/,
    "J-L": /^[J-L]/,
    "M-O": /^[M-O]/,
    "P-R": /^[P-R]/,
    "S-U": /^[S-U]/,
    "V-Z": /^[V-Z]/,
  };

  let matchedList = "0-9";

  for (const [range, regex] of Object.entries(ranges)) {
    if (regex.test(firstChar)) {
      matchedList = range;
      break;
    }
  }

  return matchedList;
}

async function getOrCreateUserCard(username, userId, displayName, joinDate, lists) {
  const matchedList = getAlphabeticalBucket(username);
  const targetList = lists.find((l) => l.name === matchedList);

  if (!targetList) {
    throw new Error(`No board list found for ${matchedList}.`);
  }

  const cardsRes = await safeFetchJson(
    `https://api.trello.com/1/lists/${targetList.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
  );

  const cards = Array.isArray(cardsRes.data) ? cardsRes.data : [];
  const desiredName = `${username} (${userId})`.toLowerCase();
  const plainName = username.toLowerCase();

  let userCard =
    cards.find((c) => c.name && c.name.toLowerCase() === desiredName) ||
    cards.find((c) => c.name && c.name.toLowerCase() === plainName);

  const description =
    `**Roblox Username:** ${username}\n` +
    `**Display Name:** ${displayName}\n` +
    `**Roblox ID:** ${userId}\n` +
    `**Join Date:** ${joinDate}`;

  if (!userCard) {
    const createCardRes = await safeFetchJson(
      `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idList: targetList.id,
          name: `${username} (${userId})`,
          desc: description,
        }),
      }
    );

    if (!createCardRes.ok || !createCardRes.data?.id) {
      throw new Error("Failed to create user card.");
    }

    userCard = createCardRes.data;
  } else {
    const updatedName =
      userCard.name && userCard.name.toLowerCase() === plainName
        ? `${username} (${userId})`
        : userCard.name;

    await safeFetchJson(
      `https://api.trello.com/1/cards/${userCard.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: updatedName,
          desc: description,
        }),
      }
    );

    userCard.name = updatedName;
    userCard.desc = description;
  }

  return userCard;
}

async function getCardLabels(cardId) {
  const res = await safeFetchJson(
    `https://api.trello.com/1/cards/${cardId}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&limit=1000`
  );

  return Array.isArray(res.data) ? res.data : [];
}

async function getOrCreateBoardLabel(labelName, color) {
  const boardLabelsRes = await safeFetchJson(
    `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&limit=1000`
  );

  if (!boardLabelsRes.ok || !Array.isArray(boardLabelsRes.data)) {
    throw new Error("Failed to fetch board labels.");
  }

  const want = normalizeLabelName(labelName);

  let label = boardLabelsRes.data.find((l) => normalizeLabelName(l.name) === want);

  if (!label) {
    const created = await safeFetchJson(
      `https://api.trello.com/1/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idBoard: TRELLO_BOARD_ID,
          name: labelName,
          color,
        }),
      }
    );

    if (!created.ok || !created.data?.id) {
      throw new Error(`Failed to create label: ${labelName}`);
    }

    label = created.data;
  }

  return label;
}

async function ensureCardHasLabel(cardId, cardLabels, labelId, shouldHave) {
  const hasIt = cardLabels.some((l) => l.id === labelId);

  if (shouldHave && !hasIt) {
    await fetch(
      `https://api.trello.com/1/cards/${cardId}/idLabels?value=${labelId}&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      { method: "POST" }
    );
    cardLabels.push({ id: labelId });
  }

  if (!shouldHave && hasIt) {
    await fetch(
      `https://api.trello.com/1/cards/${cardId}/idLabels/${labelId}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      { method: "DELETE" }
    );
    const idx = cardLabels.findIndex((l) => l.id === labelId);
    if (idx !== -1) cardLabels.splice(idx, 1);
  }
}

async function getBoardFlaggedGroups(lists) {
  if (!TRELLO_LIST_BLACKLIST) return [];

  const blacklistList = lists.find(
    (l) => normalizeLabelName(l.name) === normalizeLabelName(TRELLO_LIST_BLACKLIST)
  );

  if (!blacklistList) return [];

  const blRes = await safeFetchJson(
    `https://api.trello.com/1/lists/${blacklistList.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
  );

  const blCards = Array.isArray(blRes.data) ? blRes.data : [];

  return blCards
    .map((c) => parseInt(String(c?.name || "").trim(), 10))
    .filter((id) => !Number.isNaN(id));
}

function buildRotectorHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };

  if (ROTECTOR_API_KEY && ROTECTOR_API_KEY.trim()) {
    if (ROTECTOR_AUTH_HEADER.toLowerCase() === "authorization") {
      headers[ROTECTOR_AUTH_HEADER] = `${ROTECTOR_AUTH_PREFIX}${ROTECTOR_API_KEY}`;
    } else {
      headers[ROTECTOR_AUTH_HEADER] = ROTECTOR_API_KEY;
    }
  }

  return headers;
}

function buildRotectorUrl(pathTemplate, replacements = {}) {
  let path = pathTemplate;

  for (const [key, value] of Object.entries(replacements)) {
    path = path.replaceAll(`:${key}`, encodeURIComponent(String(value)));
  }

  return `${ROTECTOR_BASE_URL}${path}`;
}

function extractStringsDeep(value, keys = []) {
  const out = [];

  function walk(node) {
    if (!node) return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (keys.includes(k) && typeof v === "string") out.push(v);
        walk(v);
      }
    }
  }

  walk(value);
  return uniqueStrings(out);
}

function normalizeRotectorPayload(payload) {
  const root = payload?.data || payload?.result || payload || {};

  const status =
    root.status ||
    root.flagStatus ||
    root.verdict ||
    root.label ||
    root.category ||
    root.lookupResult ||
    "Unknown";

  const currentFlags = uniqueStrings([
    ...extractStringsDeep(root.currentFlags, ["name", "title", "reason", "label"]),
    ...extractStringsDeep(root.activeFlags, ["name", "title", "reason", "label"]),
    ...extractStringsDeep(root.current, ["name", "title", "reason", "label"]),
  ]);

  const allFlags = uniqueStrings([
    ...extractStringsDeep(root.flags, ["name", "title", "reason", "label"]),
    ...extractStringsDeep(root.allFlags, ["name", "title", "reason", "label"]),
    ...extractStringsDeep(root.history, ["name", "title", "reason", "label"]),
    ...extractStringsDeep(root.flagHistory, ["name", "title", "reason", "label"]),
    ...currentFlags,
  ]);

  const discordAccounts = [];
  const candidates = [
    ...safeArray(root.discords),
    ...safeArray(root.accounts),
    ...safeArray(root.linkedDiscords),
    ...safeArray(root.connections),
  ];

  for (const item of candidates) {
    if (!item) continue;

    if (typeof item === "string") {
      discordAccounts.push(item);
      continue;
    }

    const line =
      item.tag ||
      item.username ||
      item.handle ||
      item.id ||
      item.discordId ||
      item.accountId;

    if (line) discordAccounts.push(String(line));
  }

  const flagged =
    typeof root.flagged === "boolean"
      ? root.flagged
      : /flagged|unsafe|confirmed|past offender|mixed/i.test(String(status)) ||
        currentFlags.length > 0 ||
        allFlags.length > 0;

  return {
    status: String(status),
    flagged,
    currentFlags,
    allFlags,
    discordAccounts: uniqueStrings(discordAccounts),
    raw: root,
  };
}

function normalizeRotectorGroupStatus(payload) {
  const root = payload?.data || payload?.group || payload?.result || payload || {};

  const status =
    root.status ||
    root.flagStatus ||
    root.verdict ||
    root.label ||
    root.category ||
    "Unknown";

  const flagged =
    typeof root.flagged === "boolean"
      ? root.flagged
      : /flagged|unsafe|confirmed|past offender|mixed/i.test(String(status));

  const reasons = uniqueStrings([
    ...extractStringsDeep(root, ["reason", "name", "title", "label"]),
  ]);

  return {
    status: String(status),
    flagged,
    reasons,
    raw: root,
  };
}

async function fetchRotector(pathTemplate, replacements = {}) {
  const url = buildRotectorUrl(pathTemplate, replacements);

  return safeFetchJson(url, {
    method: "GET",
    headers: buildRotectorHeaders(),
  });
}

async function fetchRotectorUserBundle(userId) {
  if (!ROTECTOR_API_KEY || !ROTECTOR_API_KEY.trim()) {
    return {
      enabled: false,
      user: null,
    };
  }

  const userRes = await fetchRotector(ROTECTOR_USER_STATUS_PATH, { id: userId });

  return {
    enabled: true,
    user: userRes.ok ? normalizeRotectorPayload(userRes.data) : null,
    statusCode: userRes.status,
  };
}

async function fetchRotectorGroupBundle(groupId) {
  if (!ROTECTOR_API_KEY || !ROTECTOR_API_KEY.trim()) return null;

  const res = await fetchRotector(ROTECTOR_GROUP_STATUS_PATH, { id: groupId });
  if (!res.ok) return null;

  return normalizeRotectorGroupStatus(res.data);
}

export default {
  data: new SlashCommandBuilder()
    .setName("backgroundcheck")
    .setDescription("Run a background check on a Roblox user and sync with RDUSA records.")
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Roblox username to check")
        .setRequired(true)
    ),

  async execute(interaction, client) {
    try {
      if (!interaction.inGuild() || !interaction.guild) {
        return interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: 64,
        });
      }

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        return interaction.reply({
          content: "❌ Could not load your server member data.",
          flags: 64,
        });
      }

      const allowed = await canUseBackgroundCheck(client, interaction.guild.id, member);

      if (!allowed) {
        return interaction.reply({
          content: "❌ Unauthorized.\nYou cannot use this command.",
          flags: 64,
        });
      }

      const username = interaction.options.getString("username", true).trim();

      await interaction.reply({
        content: `🔍 Running background check for **${username}**...`,
        flags: 64,
      });

      const user = await fetchRobloxUserByUsername(username);
      if (!user) {
        return interaction.editReply({
          content: `❌ No Roblox user found with the name **${username}**.`,
        });
      }

      const userId = user.id;
      const displayName = user.displayName || username;

      const profileData = await fetchRobloxProfile(userId);
      const createdAt = new Date(profileData.created);
      const joinDate = createdAt.toLocaleDateString();
      const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / 86400000);
      const isNewAccount = accountAgeDays <= 30;

      const robloxGroups = await fetchRobloxGroups(userId);
      const userGroupIds = robloxGroups.map((g) => Number(g.groupId)).filter((id) => !Number.isNaN(id));

      const lists = await getBoardLists();
      const userCard = await getOrCreateUserCard(username, userId, displayName, joinDate, lists);

      const cardLabels = await getCardLabels(userCard.id);

      const boardFlaggedGroupIds = await getBoardFlaggedGroups(lists);
      const rdusaFlaggedGroups = robloxGroups.filter((g) =>
        boardFlaggedGroupIds.includes(Number(g.groupId))
      );

      const blacklistedGroupLabel = await getOrCreateBoardLabel("Flagged - Blacklisted Group", "red");
      await ensureCardHasLabel(
        userCard.id,
        cardLabels,
        blacklistedGroupLabel.id,
        rdusaFlaggedGroups.length > 0
      );

      const accountUnder30Label = await getOrCreateBoardLabel("Account <30", "yellow");
      await ensureCardHasLabel(userCard.id, cardLabels, accountUnder30Label.id, isNewAccount);

      let rotectorBundle = null;
      let rotectorError = null;

      try {
        rotectorBundle = await fetchRotectorUserBundle(userId);
      } catch (err) {
        console.error("❌ Rotector user lookup failed:", err);
        rotectorError = err;
      }

      const rotectorEnabled = !!(ROTECTOR_API_KEY && ROTECTOR_API_KEY.trim());

      const rotectorFlaggedGroups = [];
      let groupChecksAttempted = 0;

      if (rotectorEnabled) {
        const groupsToCheck = robloxGroups.slice(0, MAX_GROUPS_TO_CHECK_WITH_ROTECTOR);

        for (const group of groupsToCheck) {
          if (!group?.groupId) continue;

          groupChecksAttempted++;

          try {
            const groupResult = await fetchRotectorGroupBundle(group.groupId);

            if (groupResult?.flagged) {
              rotectorFlaggedGroups.push({
                groupId: group.groupId,
                groupName: group.groupName,
                roleName: group.roleName,
                status: groupResult.status,
                reasons: groupResult.reasons,
              });
            }
          } catch (err) {
            console.error(`❌ Rotector group lookup failed for ${group.groupId}:`, err);
          }
        }
      }

      const rotectorUser = rotectorBundle?.user || null;

      let rotectorUserFlagged = false;
      let currentRotectorFlags = [];
      let historicalRotectorFlags = [];
      let linkedDiscordAccounts = [];

      if (rotectorUser?.flagged) {
        rotectorUserFlagged = true;
      }

      if (rotectorUser) {
        currentRotectorFlags = uniqueStrings(rotectorUser.currentFlags || []);
        historicalRotectorFlags = uniqueStrings(
          (rotectorUser.allFlags || []).filter((flag) => !currentRotectorFlags.includes(flag))
        );
        linkedDiscordAccounts = uniqueStrings(rotectorUser.discordAccounts || []);

        if (currentRotectorFlags.length > 0 || historicalRotectorFlags.length > 0) {
          rotectorUserFlagged = true;
        }
      }

      const rotectorFlaggedLabel = await getOrCreateBoardLabel("Rotector - Flagged", "orange");
      await ensureCardHasLabel(
        userCard.id,
        cardLabels,
        rotectorFlaggedLabel.id,
        rotectorEnabled && rotectorUserFlagged
      );

      const rotectorGroupLabel = await getOrCreateBoardLabel("Rotector - Flagged Group", "pink");
      await ensureCardHasLabel(
        userCard.id,
        cardLabels,
        rotectorGroupLabel.id,
        rotectorEnabled && rotectorFlaggedGroups.length > 0
      );

      const labelsFinal = await getCardLabels(userCard.id);
      const rdusaFlags = uniqueStrings(
        labelsFinal.map((l) => (l.name && l.name.trim() ? l.name : null)).filter(Boolean)
      );

      const flagsForComment = [];

      if (rdusaFlags.length) {
        flagsForComment.push(`RDUSA | United States Military: ${rdusaFlags.join(", ")}`);
      }

      if (currentRotectorFlags.length) {
        flagsForComment.push(`Rotector Current Flags: ${currentRotectorFlags.join(", ")}`);
      }

      if (historicalRotectorFlags.length) {
        flagsForComment.push(`Rotector Flag History: ${historicalRotectorFlags.join(", ")}`);
      }

      if (linkedDiscordAccounts.length) {
        flagsForComment.push(`Rotector Discord Accounts: ${linkedDiscordAccounts.join(", ")}`);
      }

      if (rdusaFlaggedGroups.length) {
        flagsForComment.push(
          `RDUSA Blacklisted Groups: ${rdusaFlaggedGroups
            .map((g) => `${g.groupName} (${g.groupId})`)
            .join(", ")}`
        );
      }

      if (rotectorFlaggedGroups.length) {
        flagsForComment.push(
          `Rotector Flagged Groups: ${rotectorFlaggedGroups
            .map((g) => `${g.groupName} (${g.groupId})`)
            .join(", ")}`
        );
      }

      const hasAnyFlags =
        rdusaFlags.length > 0 ||
        currentRotectorFlags.length > 0 ||
        historicalRotectorFlags.length > 0 ||
        rdusaFlaggedGroups.length > 0 ||
        rotectorFlaggedGroups.length > 0;

      const commentText =
        `${hasAnyFlags ? "⚠️" : "✅"} Background Check Completed\n` +
        `Checked by: ${interaction.user.tag}\n` +
        `Date: ${new Date().toUTCString()}\n` +
        (flagsForComment.length
          ? flagsForComment.map((line) => `• ${line}`).join("\n")
          : "• No flags found");

      const commentUrl =
        `https://api.trello.com/1/cards/${userCard.id}/actions/comments` +
        `?key=${TRELLO_API_KEY}` +
        `&token=${TRELLO_TOKEN}` +
        `&text=${encodeURIComponent(commentText)}`;

      await fetch(commentUrl, { method: "POST" }).catch((err) => {
        console.error("Failed to post board comment:", err);
      });

      const embed = new EmbedBuilder()
        .setTitle(`${username} (${userId})`)
        .setColor(hasAnyFlags ? 0xed4245 : 0x57f287)
        .addFields(
          { name: "Roblox Username", value: username, inline: true },
          { name: "Display Name", value: displayName, inline: true },
          { name: "Roblox ID", value: String(userId), inline: true },
          { name: "Join Date", value: joinDate, inline: true },
          { name: "Account Age", value: `${accountAgeDays} days`, inline: true },
          {
            name: "Rotector Status",
            value: rotectorEnabled ? (rotectorUser?.status || "Not Found") : "Disabled",
            inline: true,
          },
          {
            name: "RDUSA | United States Military",
            value: rdusaFlags.length ? rdusaFlags.join("\n") : "None",
            inline: false,
          }
        )
        .setFooter({ text: "RDUSA Background Check System" })
        .setTimestamp();

      const currentFlagsChunks = chunkText(currentRotectorFlags, "None");
      const historicalFlagsChunks = chunkText(historicalRotectorFlags, "None");
      const discordChunks = chunkText(linkedDiscordAccounts, "None");
      const rdusaGroupChunks = chunkText(
        rdusaFlaggedGroups.map((g) => `${g.groupName} (${g.groupId})`),
        "None"
      );
      const rotectorGroupChunks = chunkText(
        rotectorFlaggedGroups.map((g) => `${g.groupName} (${g.groupId}) — ${g.status}`),
        "None"
      );

      embed.addFields({ name: "Rotector Current Flags", value: currentFlagsChunks[0], inline: false });
      for (let i = 1; i < currentFlagsChunks.length; i++) {
        embed.addFields({
          name: "Rotector Current Flags (Cont.)",
          value: currentFlagsChunks[i],
          inline: false,
        });
      }

      embed.addFields({ name: "Rotector Flag History", value: historicalFlagsChunks[0], inline: false });
      for (let i = 1; i < historicalFlagsChunks.length; i++) {
        embed.addFields({
          name: "Rotector Flag History (Cont.)",
          value: historicalFlagsChunks[i],
          inline: false,
        });
      }

      embed.addFields({ name: "Rotector Discord Accounts", value: discordChunks[0], inline: false });
      for (let i = 1; i < discordChunks.length; i++) {
        embed.addFields({
          name: "Rotector Discord Accounts (Cont.)",
          value: discordChunks[i],
          inline: false,
        });
      }

      embed.addFields({ name: "RDUSA Blacklisted Groups", value: rdusaGroupChunks[0], inline: false });
      for (let i = 1; i < rdusaGroupChunks.length; i++) {
        embed.addFields({
          name: "RDUSA Blacklisted Groups (Cont.)",
          value: rdusaGroupChunks[i],
          inline: false,
        });
      }

      embed.addFields({ name: "Rotector Flagged Groups", value: rotectorGroupChunks[0], inline: false });
      for (let i = 1; i < rotectorGroupChunks.length; i++) {
        embed.addFields({
          name: "Rotector Flagged Groups (Cont.)",
          value: rotectorGroupChunks[i],
          inline: false,
        });
      }

      embed.addFields({
        name: "RDUSA Record Card",
        value: `[Open Card](${userCard.url})`,
        inline: false,
      });

      if (rotectorEnabled && groupChecksAttempted < userGroupIds.length) {
        embed.addFields({
          name: "Notice",
          value: `Checked ${groupChecksAttempted}/${userGroupIds.length} Roblox groups against Rotector due to the safety cap.`,
          inline: false,
        });
      }

      if (rotectorError) {
        embed.addFields({
          name: "Rotector Warning",
          value: `Rotector user lookup failed: ${String(rotectorError.message).slice(0, 900)}`,
          inline: false,
        });
      }

      await interaction.channel.send({ embeds: [embed] });

      const logEmbed = new EmbedBuilder()
        .setColor(hasAnyFlags ? 0xed4245 : 0x57f287)
        .setTitle("🔎 Background Check Logged")
        .addFields(
          { name: "Checked By", value: interaction.user.tag, inline: true },
          { name: "Roblox Username", value: username, inline: true },
          { name: "Roblox ID", value: String(userId), inline: true },
          { name: "Account Age", value: `${accountAgeDays} days`, inline: true },
          {
            name: "Rotector Status",
            value: rotectorEnabled ? (rotectorUser?.status || "Not Found") : "Disabled",
            inline: true,
          },
          {
            name: "Flags Found",
            value: hasAnyFlags ? "Yes" : "No",
            inline: true,
          },
          {
            name: "RDUSA | United States Military",
            value: rdusaFlags.length ? rdusaFlags.join(", ") : "None",
            inline: false,
          },
          {
            name: "Rotector Current Flags",
            value: currentRotectorFlags.length ? currentRotectorFlags.join(", ") : "None",
            inline: false,
          },
          {
            name: "Rotector Discord Accounts",
            value: linkedDiscordAccounts.length ? linkedDiscordAccounts.join(", ") : "None",
            inline: false,
          },
          {
            name: "Rotector Flagged Groups",
            value: rotectorFlaggedGroups.length
              ? rotectorFlaggedGroups.map((g) => `${g.groupName} (${g.groupId})`).join(", ")
              : "None",
            inline: false,
          },
          {
            name: "RDUSA Record Card",
            value: userCard.url || "N/A",
            inline: false,
          }
        )
        .setTimestamp();

      await sendModLog(interaction, logEmbed);

      await interaction.editReply({
        content: "✅ Background check posted.",
        embeds: [],
      });
    } catch (err) {
      console.error("Error in /backgroundcheck:", err);

      try {
        const failEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("❌ Background Check Failed")
          .addFields(
            { name: "User", value: interaction.user.tag, inline: true },
            {
              name: "Channel",
              value: interaction.channel?.id ? `<#${interaction.channel.id}>` : "Unknown",
              inline: true,
            },
            {
              name: "Error",
              value: String(err?.message || err).slice(0, 1024),
              inline: false,
            }
          )
          .setTimestamp();

        await sendModLog(interaction, failEmbed);
      } catch {
        // ignore
      }

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "❌ An error occurred while running the background check.",
        });
      } else {
        await interaction.reply({
          content: "❌ An error occurred while running the background check.",
          flags: 64,
        });
      }
    }
  },
};