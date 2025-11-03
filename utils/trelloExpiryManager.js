import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const { TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID } = process.env;

export async function checkExpiredBlacklists(client) {
  try {
    console.log("⏳ Checking Trello for expired Commission Blacklists...");

    // Get all labels to locate the "Commission Blacklist" label ID
    const labelsRes = await fetch(
      `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const labels = await labelsRes.json();
    const blacklistLabel = labels.find((l) => l.name === "Commission Blacklist");
    if (!blacklistLabel) return console.log("⚠️ No 'Commission Blacklist' label found on Trello.");

    // Get all cards with that label
    const cardsRes = await fetch(
      `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/cards?labels=all&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const cards = await cardsRes.json();
    const blacklistCards = cards.filter((c) =>
      c.labels.some((lbl) => lbl.id === blacklistLabel.id)
    );

    if (blacklistCards.length === 0)
      return console.log("✅ No active Commission Blacklists found.");

    for (const card of blacklistCards) {
      // Fetch comments for each card
      const actionsRes = await fetch(
        `https://api.trello.com/1/cards/${card.id}/actions?filter=commentCard&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      );
      const actions = await actionsRes.json();

      // Look for "Expires:" in comment text
      const expiryComment = actions.find((a) =>
        a.data.text.includes("Expires:")
      );
      if (!expiryComment) continue;

      const match = expiryComment.data.text.match(
        /Expires:\s?(.+)/
      );
      if (!match) continue;

      const expiryDate = new Date(match[1]);
      if (isNaN(expiryDate.getTime())) continue;

      // If expiration has passed, remove label
      if (expiryDate < new Date()) {
        console.log(`🧹 Removing expired blacklist from ${card.name}`);

        // Remove label
        await fetch(
          `https://api.trello.com/1/cards/${card.id}/idLabels/${blacklistLabel.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          { method: "DELETE" }
        );

        // Add a comment noting auto-removal
        await fetch(
          `https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `🕓 This user's Commission Blacklist has expired and was automatically removed on ${new Date().toUTCString()}.`,
            }),
          }
        );
      }
    }

    console.log("✅ Finished checking for expired Commission Blacklists.");
  } catch (err) {
    console.error("❌ Error while checking Trello blacklist expirations:", err);
  }
}
