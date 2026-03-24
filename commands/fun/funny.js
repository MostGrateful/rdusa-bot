// commands/fun/funny.js
import { SlashCommandBuilder } from "discord.js";

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const promotedRoles = [
  "Master of Vibes",
  "Senior Fun Consultant",
  "Chief Meme Officer",
  "VIP of Chaos Control",
  "Executive of Excellent Energy",
  "Head of Tactical Napping",
  "Director of Tactical Coffee Breaks",
  "Lead Chaos Coordinator",
  "Elite Banter Specialist",
  "Supreme Overlord of Inside Jokes",
  "Grandmaster of Good Times",
  "Prime Minister of Laughs",
  "High Council Member of Vibes",
  "Legendary Tier Human",
  "Chief Officer of Shenanigans",
  "Guardian of the Group Chat",
  "Head of Morale & Mischief",
  "Ambassador of Chill",
  "Senior Director of Tomfoolery",
  "Regional Manager of Chaos",

  // ✅ NEW ADDITIONS
  "Chief Snack Strategist",
  "Director of Unnecessary Commentary",
  "Assistant to the Regional Meme Manager",
  "Certified Vibe Technician",
  "Principal Investigator of Who Asked",
  "Commander of the Couch Division",
  "Executive Producer of Plot Twists",
  "Senior Analyst of Silly Business",
  "Captain of Side Quests",
  "National Treasurer of Good Energy",
  "Official Keeper of The Sauce",
  "Supervisor of Randomness",
  "Head of Dramatic Entrances",
  "First Lieutenant of Friendly Roasts",
  "Chief Executive of Good Choices (Allegedly)",
  "Director of Vibes & Compliance",
  "Supreme Chancellor of Chillness",
  "Master of Accidental Comedy",
  "Professional Button Clicker",
  "Keeper of the Forbidden Memes",
  "Head of Midnight Motivation",
  "General of Giggles",
  "Ambassador of Small Talk",
  "Chairperson of Overthinking",
  "Chief Apology Officer",
  "Lead Investigator of Missing Socks",
  "Director of Strategic Procrastination",
  "High Priest of Snacks",
  "Master of the Perfect Reply",
  "Elite Specialist of “Bet.”",
  "Senior Manager of “One More Game”",
  "Commander of The Playlist",
  "CEO of Saying “Real.”",
  "Director of Unhinged Ideas",
  "Guardian of the Last Brain Cell",
  "Supervisor of Chaos Logistics",
  "Senior Officer of Low Effort, High Impact",
  "Head of Approved Nonsense",
  "Regional Director of Shenanigan Operations",
  "Chief Vibe Auditor",
  "Head of Mischief Engineering",
  "Field Marshal of Funny Business",
  "Honorary Knight of Good Times",
  "Minister of Mildly Dangerous Ideas",
  "Chief Hype Officer",
  "Director of Motivational Yelling",
];

const promotedOpeners = [
  "has promoted you to",
  "is proud to announce your promotion to",
  "says you’ve officially been upgraded to",
  "just handed you the title of",
  "has decided you’re now",
  "says HR has approved your promotion to",
  "has secretly been planning to make you",
  "says the council has voted and you’re now",
  "just wrote your name down as",
  "says the universe has selected you as",

  // ✅ NEW ADDITIONS
  "has upgraded your rank to",
  "just unlocked the achievement:",
  "has issued you the official title of",
  "is legally obligated to inform you that you are now",
  "declares, with great confidence, that you are now",
  "has chosen you (against your will) to be",
  "would like to remind everyone you are now",
  "has run the numbers and confirmed you’re officially",
  "has signed the paperwork making you",
  "announces that fate has appointed you as",
  "has pinned a badge on you that says",
  "has nominated you for the position of",
  "has promoted you (with zero warning) to",
  "has updated your resume to include:",
  "has granted you the sacred title of",
  "has pressed the big red button and made you",
  "has elevated you to the prestigious role of",
  "has had a vision… and you are now",
  "has pulled strings behind the scenes to make you",
  "has declared you the one and only",
];

const promotedSuffixes = [
  "… no take-backs.",
  "and honestly, it’s about time.",
  "because someone had to do it.",
  "and the crowd goes wild. 🎉",
  "with full benefits in vibes and memes.",
  "and your starting bonus is one high five.",
  "and your only job is to keep being you.",
  "and your contract is valid until further silliness.",
  "and your pay is 100% in respect and chaos.",
  "effective immediately, no paperwork needed.",

  // ✅ NEW ADDITIONS
  "please do not abuse this power (but also… do).",
  "this decision is final and extremely questionable.",
  "HR would like to have a word with you.",
  "your badge arrives in 3–5 business memes.",
  "you now get one (1) free dramatic sigh per day.",
  "you’re entitled to unlimited snack breaks (unpaid).",
  "the benefits include: absolutely nothing, enjoy.",
  "welcome to the role. training starts never.",
  "this promotion is sponsored by pure chaos.",
  "and yes, we’re all counting on you.",
  "your uniform is imaginary but mandatory.",
  "use this title responsibly… or don’t.",
  "your first assignment: keep it iconic.",
  "your second assignment: pretend you know what you’re doing.",
  "and your ringtone is now laughter.",
  "you’ve been promoted due to outstanding silliness.",
  "this is a lifetime appointment (sorry).",
  "and your signature move is now “legendary.”",
  "the council is watching. 👀",
  "congratulations. you are now 10% more powerful.",
  "this role comes with a complimentary thumbs-up 👍",
  "please report to the vibe department immediately.",
  "your paycheck is paid in ✨vibes✨.",
  "and your authority is certified by absolutely no one.",
  "effective immediately—go be a problem (respectfully).",
];

function buildPromotedMessage(invoker, targetMention) {
  const role = pick(promotedRoles);
  const opener = pick(promotedOpeners);
  const suffix = pick(promotedSuffixes);
  return `${targetMention}, ${invoker} ${opener} **${role}** ${suffix}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName("funny")
    .setDescription("Promote someone to a ridiculous title.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Who are we promoting?")
        .setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user");
    const msg = buildPromotedMessage(interaction.user.toString(), target.toString());
    return interaction.reply({ content: msg });
  },
};
