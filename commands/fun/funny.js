import { SlashCommandBuilder } from "discord.js";

const ALLOWED_ROLE_ID = "1442276596558987446";

const CATEGORY_CHOICES = [
  { name: "Promoted / Benefited", value: "promoted" },
  { name: "Being Fired (Joking)", value: "fired" },
  { name: "Wholesome / Nice", value: "wholesome" },
  { name: "Silly / Jolly Joke", value: "silly" },
  { name: "Mean but SFW (Roast)", value: "mean" },
  { name: "Random Mix", value: "random" },
];

/* -------------------------------------------------------------------------- */
/*                          RANDOM HELPER & UTILITIES                         */
/* -------------------------------------------------------------------------- */

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/* -------------------------------------------------------------------------- */
/*                        PROMOTED / BENEFITED MESSAGE                        */
/* -------------------------------------------------------------------------- */

const promotedRoles = [
  "Chief Giggle Inspector",
  "Director of Shenanigans",
  "Manager of Good Vibes",
  "Head of Happiness",
  "CEO of Chill",
  "Professional Vibe Bringer",
  "Full-Time Legend",
  "Certified W Rizz Holder",
  "Supreme Commander of Snacks",
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
];

function buildPromotedMessage(invoker, target) {
  const role = pick(promotedRoles);
  const opener = pick(promotedOpeners);
  const suffix = pick(promotedSuffixes);
  return `${target}, ${invoker} ${opener} **${role}** ${suffix}`;
}

/* -------------------------------------------------------------------------- */
/*                           FIRED (JOKING) MESSAGE                           */
/* -------------------------------------------------------------------------- */

const firedFroms = [
  "Resident Overthinker",
  "President of the No-Fun Club",
  "Professional Procrastinator",
  "Local Vibe Killer",
  "Chief of Being Too Serious",
  "Manager of Unnecessary Stress",
  "Head of Overcomplicating Things",
  "Director of Low Battery Mode",
  "CEO of Saying \"I’m Fine\" When You’re Not",
  "Lead Over-Apologizer",
  "Captain of Awkward Energy",
  "Supervisor of Bad Decisions",
];

const firedReasons = [
  "you’ve been replaced by good vibes.",
  "the company is pivoting to more fun.",
  "your services of being stressed were no longer required.",
  "HR said your silliness quota is too low.",
  "you got caught having potential.",
  "they found out you’re actually cool.",
  "you smiled once and that violated the No-Fun policy.",
  "someone reported you for being secretly wholesome.",
  "your chaos potential is better used elsewhere.",
  "they discovered you’re a main character, not an NPC.",
];

const rehiredAs = [
  "Head of Chaos",
  "Professional Vibe Bringer",
  "Full-Time Legend",
  "Certified Menace (in a good way)",
  "Director of Situational Comedy",
  "Chief Energy Officer",
  "Lead Meme Technician",
  "Premium Human",
  "CEO of Laughing at the Group Chat",
  "Commander of Just Vibing",
];

function buildFiredMessage(invoker, target) {
  const oldRole = pick(firedFroms);
  const reason = pick(firedReasons);
  const newRole = pick(rehiredAs);
  const style = Math.floor(Math.random() * 3);

  if (style === 0) {
    return `${target}, ${invoker} says you’re **fired** from being **${oldRole}** because ${reason}`;
  } else if (style === 1) {
    return `${target}, ${invoker} says HR called: you’re fired from **${oldRole}**, but instantly rehired as **${newRole}**.`;
  } else {
    return `${target}, ${invoker} just terminated your contract with boredom. New position: **${newRole}**.`;
  }
}

/* -------------------------------------------------------------------------- */
/*                           WHOLESOME / NICE MESSAGE                         */
/* -------------------------------------------------------------------------- */

const wholesomeOpeners = [
  "wants you to know",
  "says",
  "just wanted to remind you",
  "asked me to tell you",
  "thinks you should hear this",
  "insists",
];

const wholesomeCores = [
  "you’re doing amazing, even if you don’t feel like it.",
  "you matter more than you realize.",
  "the world is genuinely better with you in it.",
  "you’ve made a difference in people’s lives, even quietly.",
  "your presence makes things feel less heavy.",
  "you’re allowed to rest without earning it.",
  "you deserve kindness, especially from yourself.",
  "you are not a burden; you are a person.",
  "someone out there is grateful you exist.",
  "you’ve survived 100% of your bad days so far.",
  "you’re not behind; you’re on your own timeline.",
  "you don’t have to be perfect to be loved.",
  "you are more capable than you give yourself credit for.",
  "your small efforts still count as progress.",
];

const wholesomeAddons = [
  "💖",
  "and that’s a fact, not an opinion.",
  "and I will personally back that statement.",
  "and I hope you don’t forget it.",
  "seriously, don’t argue with this.",
  "keep going, okay?",
  "you’re allowed to take up space here.",
  "you deserve something good today.",
  "I’m rooting for you.",
  "✨",
  "👏",
];

function buildWholesomeMessage(invoker, target) {
  const opener = pick(wholesomeOpeners);
  const core = pick(wholesomeCores);
  const addon = pick(wholesomeAddons);
  return `${target}, ${invoker} ${opener} that ${core} ${addon}`;
}

/* -------------------------------------------------------------------------- */
/*                           SILLY / JOLLY JOKE MESSAGE                      */
/* -------------------------------------------------------------------------- */

const sillyComparisons = [
  "a caffeinated squirrel",
  "a walking plot twist",
  "a browser with 97 tabs open, 3 frozen, and music playing",
  "the human version of ‘Wi-Fi connected’",
  "the DLC no one read the patch notes for",
  "a chaotic good side character",
  "a sentient energy drink",
  "a main character on season 3 of your own show",
  "a walking blooper reel",
  "a meme that became self-aware",
  "a speedrun of questionable decisions",
  "a mystery loot box with no label",
];

const sillyLines = [
  "you walk like there’s theme music behind you.",
  "your default mode is **confused but determined**.",
  "you prove daily that chaos and charm can coexist.",
  "you generate side quests wherever you go.",
  "you’re the reason the group chat stays alive.",
  "if life was a game, you’d be the secret boss fight.",
  "your vibe is ‘I’ll figure it out live’.",
  "you make NPCs nervous.",
  "you’re the plot twist nobody saw coming.",
  "your aura says ‘I didn’t read the instructions, but I got this’.",
];

function buildSillyMessage(invoker, target) {
  const comp = pick(sillyComparisons);
  const line = pick(sillyLines);
  const style = Math.floor(Math.random() * 2);

  if (style === 0) {
    return `${target}, ${invoker} ran the numbers and confirmed: you are basically **${comp}**.`;
  } else {
    return `${target}, ${invoker} says ${line}`;
  }
}

/* -------------------------------------------------------------------------- */
/*                             MEAN BUT SFW (ROAST)                          */
/* -------------------------------------------------------------------------- */

const roastStarters = [
  "says you’re not lazy—you just run on **ultra power-saving mode**.",
  "says if brains were Wi-Fi, you’d still be buffering.",
  "says your brain has left the chat again.",
  "says your attention span timed out due to inactivity.",
  "says you’re living proof the tutorial was skipped.",
  "says your life is on ‘shuffle’ with no playlist.",
  "says your thinking process is still in beta.",
  "says your brain is using potato battery mode.",
  "says you’re the reason autosave exists.",
  "says you read the terms and conditions of life and hit ‘I agree’ without looking.",
];

const roastComparisons = [
  "an unskippable ad before the main event.",
  "a group project where you did none of the work but still got credit.",
  "a software update that says ‘5 minutes remaining’ for 2 hours.",
  "a GPS that says ‘recalculating’ every 3 seconds.",
  "a loading screen with no progress bar.",
  "a YouTube tutorial that skips the one step people actually need.",
  "a pop-up that appears exactly when someone is busy.",
];

const roastSofteners = [
  "but somehow, it’s still entertaining.",
  "and yet, we’d still keep you around.",
  "but we’d be bored without you.",
  "and honestly, it adds spice to the group.",
  "but we say it with love. Probably.",
  "and yet you’re still everyone’s favorite problem.",
];

function buildMeanMessage(invoker, target) {
  const starter = pick(roastStarters);
  const comp = pick(roastComparisons);
  const softener = pick(roastSofteners);
  const style = Math.floor(Math.random() * 2);

  if (style === 0) {
    return `${target}, ${invoker} ${starter}`;
  } else {
    return `${target}, ${invoker} says you are basically **${comp}**… ${softener}`;
  }
}

/* -------------------------------------------------------------------------- */
/*                    MESSAGE DISPATCH BY CATEGORY TYPE                       */
/* -------------------------------------------------------------------------- */

function getMessageByCategory(category, invoker, target) {
  switch (category) {
    case "promoted":
      return buildPromotedMessage(invoker, target);
    case "fired":
      return buildFiredMessage(invoker, target);
    case "wholesome":
      return buildWholesomeMessage(invoker, target);
    case "silly":
      return buildSillyMessage(invoker, target);
    case "mean":
      return buildMeanMessage(invoker, target);
    case "random":
    default: {
      const pool = ["promoted", "fired", "wholesome", "silly", "mean"];
      const randomCategory = pick(pool);
      return getMessageByCategory(randomCategory, invoker, target);
    }
  }
}

/* ----------------------- TENOR QUERIES BY CATEGORY ------------------------ */

const tenorQueriesByCategory = {
  promoted: [
    "promotion celebration gif",
    "you got promoted funny",
    "congratulations funny gif",
    "you did it gif",
  ],
  fired: [
    "you are fired funny gif",
    "funny office fired meme",
    "funny awkward work gif",
  ],
  wholesome: [
    "wholesome gif",
    "cute supportive gif",
    "you got this gif",
    "proud of you gif",
  ],
  silly: [
    "funny random gif",
    "goofy meme gif",
    "funny chaos gif",
    "lol gif",
  ],
  mean: [
    "funny roast gif",
    "funny side eye gif",
    "sarcastic reaction gif",
    "funny disappointment gif",
  ],
  random: [
    "funny meme gif",
    "random funny gif",
    "silly reaction gif",
    "haha gif",
  ],
};

async function getRandomTenorGif(category) {
  const API = process.env.TENOR_API_KEY;
  if (!API) return null;

  try {
    const key = tenorQueriesByCategory[category] ? category : "random";
    const queries = tenorQueriesByCategory[key];
    const query = pick(queries);
    const limit = 20;

    const url =
      `https://tenor.googleapis.com/v2/search` +
      `?q=${encodeURIComponent(query)}` +
      `&key=${API}` +
      `&client_key=rdusa_bot` +
      `&limit=${limit}` +
      `&media_filter=gif`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.results?.length) return null;

    const choice = pick(data.results);

    return (
      choice.media_formats?.gif?.url ||
      choice.media_formats?.mediumgif?.url ||
      choice.url ||
      null
    );
  } catch (err) {
    console.error("Tenor GIF error:", err);
    return null;
  }
}

/* ------------------------------ COMMAND DEF ------------------------------- */

export default {
  data: new SlashCommandBuilder()
    .setName("funny")
    .setDescription("Send a funny, SFW message or gif to someone.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Who should be the target of the joke?")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("What kind of joke do you want?")
        .setRequired(true)
        .addChoices(...CATEGORY_CHOICES),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    const member = interaction.member;
    if (!member.roles.cache.has(ALLOWED_ROLE_ID)) {
      return interaction.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser("user");
    const category = interaction.options.getString("category");

    const targetMention = `<@${target.id}>`;
    const invokerMention = `<@${interaction.user.id}>`;

    const funnyText = getMessageByCategory(category, invokerMention, targetMention);
    const gifUrl = await getRandomTenorGif(category);

    let content = funnyText;
    if (gifUrl) {
      content += `\n${gifUrl}`;
    } else {
      content += `\n*(No GIF loaded this time, but the joke still stands 😄)*`;
    }

    await interaction.reply({
      content,
      ephemeral: false, // visible to everyone
    });
  },
};
