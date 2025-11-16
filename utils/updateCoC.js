import fetch from "node-fetch";
import { EmbedBuilder } from "discord.js";

const GROUP_ID = 35514277;

export async function updateChainOfCommand(client) {
  try {
    const res = await fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}/roles`);
    const data = await res.json();

    if (!data.roles) throw new Error("Invalid Roblox group data.");

    // Map ranks by name for easy lookup
    const roles = Object.fromEntries(data.roles.map(r => [r.name.toLowerCase(), r]));

    // Helper function to get first user for a given role
    const getUser = async (roleName) => {
      const role = roles[roleName.toLowerCase()];
      if (!role) return "Vacant";
      const userRes = await fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}/roles/${role.id}/users?limit=1`);
      const userData = await userRes.json();
      const user = userData.data?.[0];
      return user ? user.username : "Vacant";
    };

    // ───────────────────────────────
    // 📋 Build Sections
    // ───────────────────────────────
    const potus = await getUser("Commander in Chief");
    const vpotus = await getUser("Vice Commander in Chief");
    const advisor = await getUser("National Security Advisor");
    const deputyAdvisor = await getUser("Deputy National Security Advisor");
    const csarmy = await getUser("Chief of Staff of the Army");
    const vcsarmy = await getUser("Vice Chief of Staff of the Army");
    const sma = await getUser("Sergeant Major of the Army");
    const director = await getUser("Director of Army Staff");
    const inspector = await getUser("Inspector General of the Army");
    const judge = await getUser("Judge Advocate General of The Army");

    // ───────────────────────────────
    // 📜 Build Embed
    // ───────────────────────────────
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("🇺🇸 United States Army Chain of Command")
      .setDescription("Officially synchronized with the Roblox group ranks.")
      .addFields(
        {
          name: "Section 1: :POTUS: Cabinet",
          value:
            `**Commander in Chief**\n:POTUS: President — ${potus}\n\n` +
            `**Vice Commander in Chief**\n:VPOTUS: Vice President — ${vpotus}`,
        },
        {
          name: "Section 2: :XOPOTUS: Executive Office of the President",
          value:
            `[National Security Advisor]\n:XOPOTUS: Advisor — ${advisor}\n\n` +
            `Deputy [National Security Advisor]\n:XOPOTUS: Deputy Advisor — ${deputyAdvisor}`,
        },
        {
          name: "Section 3: :csaflag: Office of the Chief of Staff",
          value:
            `[Chief of Staff of the Army]\n:O10: General — ${csarmy}\n\n` +
            `[Vice Chief of Staff of the Army]\n:O10: General — ${vcsarmy}\n\n` +
            `[Sergeant Major of the Army]\n:E9C: Sergeant Major of the Army — ${sma}\n\n` +
            `[Director of Army Staff]\n:O9: Lieutenant General — ${director}\n\n` +
            `[Inspector General of the Army]\n:O9: Lieutenant General — ${inspector}\n\n` +
            `[Judge Advocate General of The Army]\n:O9: Lieutenant General — ${judge}`,
        }
      )
      .setFooter({
        text: "Last updated from Roblox group data",
      })
      .setTimestamp();

    // Post or update CoC message if configured
    const cocChannelId = process.env.COC_CHANNEL_ID;
    if (cocChannelId) {
      const channel = await client.channels.fetch(cocChannelId).catch(() => null);
      if (channel) {
        await channel.send({ embeds: [embed] });
      }
    }

    console.log("✅ Chain of Command updated successfully.");
    return embed;
  } catch (err) {
    console.error("❌ Error updating Chain of Command:", err);
    return null;
  }
}
