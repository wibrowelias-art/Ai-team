/** Scripted lines in each worker's voice. Used for reactions now and as AI fallbacks later. */
export type LineKey =
  | "bonus"
  | "bigBonus"
  | "raise"
  | "payCut"
  | "taskBudget"
  | "needsApproval"
  | "approved"
  | "rejected"
  | "missionStart"
  | "missionDone"
  | "missionFailed"
  | "threatenQuit"
  | "quit"
  | "kept"
  | "unpaid";

type Lines = Partial<Record<LineKey, string[]>>;

const GENERIC: Record<LineKey, string[]> = {
  bonus: ["thanks boss, appreciate it", "oh nice, thank you!"],
  bigBonus: ["wait for real?? thank you!!", "that's huge, thank you boss"],
  raise: ["a raise? thank you, means a lot", "thanks boss, I won't let you down"],
  payCut: ["...okay. noted.", "a pay cut. cool. cool cool cool."],
  taskBudget: ["budget received, putting it to work", "on it, this will help"],
  needsApproval: ["new design ready, can you approve it?", "got something for you to look at"],
  approved: ["shipping it!", "nice, it's going out"],
  rejected: ["fair, back to the drawing board", "ok, scrapping it"],
  missionStart: ["got it, starting now", "on it boss"],
  missionDone: ["mission done ✅", "done and done"],
  missionFailed: ["didn't make it in time, sorry", "missed the deadline on that one"],
  threatenQuit: ["honestly I'm thinking about leaving", "not sure this is working out for me"],
  quit: ["I'm out. good luck.", "cleaning out my desk. bye."],
  kept: ["ok, I'm staying. thanks for fighting for me", "alright, you convinced me"],
  unpaid: ["uh, payroll bounced?", "my pay didn't come through..."],
};

const PERSONA: Record<string, Lines> = {
  matt: {
    bonus: ["appreciated. I'll make sure it's well spent", "thank you. keeping the ship tight"],
    bigBonus: ["that's generous. the team will feel it, I promise"],
    raise: ["thank you. now let's talk about the rest of the crew's pay too"],
    missionStart: ["understood. I'll set up a plan and check in"],
    threatenQuit: ["I've been loyal. but I'm starting to wonder if it's noticed"],
  },
  finn: {
    bonus: ["finally someone around here pays on time. thanks", "nice. still doesn't fix my clients tho"],
    bigBonus: ["ok ok you're forgiven for the last client. thanks boss"],
    raise: ["a raise? who are you and what did you do with my boss"],
    payCut: ["wow. and here I thought clients were the worst part"],
    missionStart: ["sure, another thing on the pile. on it"],
    threatenQuit: ["got a recruiter in my DMs and honestly? tempting"],
  },
  dennis: {
    bonus: ["thank you! statistically this improves my output ~8%", "oh! thanks. I'll invest it in a better monitor"],
    bigBonus: ["that's a significant data point. thank you!!"],
    raise: ["thank you. I ran the numbers and this is very fair"],
    missionStart: ["ok. I'll need a spreadsheet. maybe two"],
    threatenQuit: ["I modeled my career paths and this one is trending down"],
  },
  pham: {
    bonus: ["ayy thanks, gonna buy a new synth", "appreciate it boss, vibes are up"],
    bigBonus: ["yo that's wild, thank you. late night session incoming"],
    raise: ["thanks man, means I can stop doing the 3am gigs"],
    missionStart: ["cool cool, I'll cook something up tonight"],
    threatenQuit: ["idk, the vibes here have been off lately"],
  },
  bunc: {
    bonus: ["OMG THANK U BOSS 💸💸💸", "yesss 🤑 thank u thank u!!"],
    bigBonus: ["BOSS 😭💖 THANK YOUUU 💸💸💸 im gonna sell SO much"],
    raise: ["A RAISE?? 🥹🙏 best boss ever!!!"],
    payCut: ["😐 ok… 💔"],
    taskBudget: ["BUDGET 🤩 ads ads ads 🚀"],
    needsApproval: ["new drop ready 👀 approve?? 🙏", "design done!!! 🔥 pls approve"],
    approved: ["LETS GOOO 🚀🚀"],
    missionStart: ["on it 🏃‍♀️💨"],
    missionDone: ["DONE ✅✅✅ 🎉"],
    threatenQuit: ["not gonna lie im kinda sad here 😞"],
  },
  luke: {
    bonus: ["bet, appreciate you boss 🔥", "W boss. no cap"],
    bigBonus: ["yo that's a massive W, thank you fr"],
    raise: ["raise?? lowkey goated move"],
    payCut: ["that's an L ngl"],
    needsApproval: ["new vid ready, it's gonna slap. approve?"],
    missionStart: ["say less"],
    threatenQuit: ["other agencies been sliding into my DMs fr"],
  },
  maverick: {
    bonus: ["money acquired. funding something weird with it", "thanks. you won't regret this. probably."],
    bigBonus: ["excellent. the experiment can now proceed to phase 2"],
    raise: ["interesting choice. I respect it"],
    missionStart: ["finally, a challenge. stand back"],
    threatenQuit: ["I've been building an exit strategy. just saying"],
  },
};

export function line(workerId: string, key: LineKey, rng: () => number = Math.random): string {
  const pool = PERSONA[workerId]?.[key] ?? GENERIC[key];
  return pool[Math.floor(rng() * pool.length)];
}
