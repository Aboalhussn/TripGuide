// A pretend AI for tests and for trying the assistant with no key and no internet (AI_PROVIDER=mock).
// It understands simple messages in English and Arabic: governorate names, dates ("2026-12-05",
// "December 5", "3 days"), group size, budget ("$80"), languages and interests, and answers with the
// same JSON a real model would. It is not clever; it is predictable.
import { applyPatch, checkDraft, draftDays, type MissingKey } from '../core/draft';
import type { AiProvider } from './ai';
import type { TurnView } from './assistant';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const LANG_WORDS: [RegExp, string][] = [
  [/english|انجليزي|إنجليزي|انكليزي/i, 'en'],
  [/arabic|عربي/i, 'ar'],
  [/kurdish|كردي/i, 'ku'],
  [/persian|farsi|فارسي/i, 'fa'],
  [/turkish|تركي/i, 'tr'],
  [/urdu|أردو|اوردو/i, 'ur'],
  [/french|فرنسي/i, 'fr'],
  [/german|ألماني|الماني/i, 'de'],
  [/spanish|إسباني|اسباني/i, 'es'],
  [/italian|إيطالي|ايطالي/i, 'it'],
  [/russian|روسي/i, 'ru'],
  [/chinese|صيني/i, 'zh'],
];

const INTEREST_WORDS: [RegExp, string][] = [
  [/histor|تاريخ/i, 'history'],
  [/archaeolog|ruins|ancient|آثار|اثار|أثري/i, 'archaeology'],
  [/religio|shrine|ziyara|pilgrim|مرقد|مراقد|زيارة|ديني/i, 'religious'],
  [/food|eat|cuisine|أكل|اكل|مطاعم/i, 'food'],
  [/photo|تصوير/i, 'photography'],
  [/market|souq|bazaar|سوق|أسواق|اسواق/i, 'markets'],
  [/architect|عمارة|معمار/i, 'architecture'],
  [/nature|marsh|river|طبيعة|أهوار|اهوار/i, 'nature'],
  [/museum|متحف|متاحف/i, 'museums'],
  [/famil|kids|children|عائلة|أطفال|اطفال/i, 'families'],
];

const ASK: Record<'en' | 'ar', Record<MissingKey, string>> = {
  en: {
    cities: 'Which governorates would you like to visit? For example Baghdad, Babylon, Karbala or Erbil.',
    dates: 'Which dates? Tell me the first day and how many days.',
    groupSize: 'How many people are travelling?',
    languages: 'Which language should your guide speak?',
    budget: "What's your budget per day for the guide, in US dollars?",
    title: '',
  },
  ar: {
    cities: 'أي محافظات تحب تزور؟ مثلاً بغداد، بابل، كربلاء أو أربيل.',
    dates: 'شنو التواريخ؟ كلّي أول يوم وكم يوم.',
    groupSize: 'كم شخص راح يسافر؟',
    languages: 'بأي لغة تحب يحچي المرشد؟',
    budget: 'شكد ميزانيتك لليوم للمرشد بالدولار؟',
    title: '',
  },
};

const pad = (n: number) => String(n).padStart(2, '0');

// Arabic months (Iraqi and Egyptian names) → month number.
const AR_MONTHS: [RegExp, number][] = [
  [/كانون الثاني|يناير/, 1], [/شباط|فبراير/, 2], [/آذار|اذار|مارس/, 3], [/نيسان|أبريل|ابريل/, 4], [/أيار|ايار|مايو/, 5], [/حزيران|يونيو/, 6],
  [/تموز|يوليو/, 7], [/آب|اب|أغسطس|اغسطس/, 8], [/أيلول|ايلول|سبتمبر/, 9], [/تشرين الأول|تشرين الاول|أكتوبر|اكتوبر/, 10], [/تشرين الثاني|نوفمبر/, 11], [/كانون الأول|كانون الاول|ديسمبر/, 12],
];
// Number words people write instead of digits.
const AR_NUMBERS: [RegExp, string][] = [
  [/(?:^|\s)(?:واحد|وحدة)(?=\s|$)/g, ' 1 '], [/(?:^|\s)(?:اثنين|اثنان|إثنين|ثنين)(?=\s|$)/g, ' 2 '], [/(?:^|\s)(?:ثلاث|ثلاثة|ثلث|تلات)(?=\s|$)/g, ' 3 '],
  [/(?:^|\s)(?:أربع|اربع|أربعة|اربعة)(?=\s|$)/g, ' 4 '], [/(?:^|\s)(?:خمس|خمسة)(?=\s|$)/g, ' 5 '], [/(?:^|\s)(?:ست|ستة)(?=\s|$)/g, ' 6 '],
  [/(?:^|\s)(?:سبع|سبعة)(?=\s|$)/g, ' 7 '], [/(?:^|\s)(?:ثمان|ثمانية|ثمن)(?=\s|$)/g, ' 8 '], [/(?:^|\s)(?:تسع|تسعة)(?=\s|$)/g, ' 9 '], [/(?:^|\s)(?:عشر|عشرة)(?=\s|$)/g, ' 10 '],
];
const EN_NUMBERS: [RegExp, string][] = [
  [/\bone\b/gi, '1'], [/\btwo\b/gi, '2'], [/\bthree\b/gi, '3'], [/\bfour\b/gi, '4'], [/\bfive\b/gi, '5'], [/\bsix\b/gi, '6'], [/\bseven\b/gi, '7'], [/\beight\b/gi, '8'], [/\bnine\b/gi, '9'], [/\bten\b/gi, '10'],
];

// Turns Arabic digits and common Arabic/English phrasings into the simple forms the rules below read.
function normalize(raw: string): string {
  let t = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  t = t.replace(/[،؛]/g, ' , ');
  for (const [re, n] of AR_NUMBERS) t = t.replace(re, n);
  for (const [re, n] of EN_NUMBERS) t = t.replace(re, n);
  t = t
    .replace(/(?:لـ?|ل)?شخصين|اثنين أشخاص/g, ' 2 أشخاص ')
    .replace(/(?:شخص واحد|بس أنا|بس انا|لوحدي)/g, ' 1 أشخاص ')
    .replace(/يومين/g, ' 2 أيام ')
    .replace(/(?:أسبوع|اسبوع|week)(?!\s*(?:الجاي|القادم|الجاية))/gi, (m) => (/week/i.test(m) ? ' 7 days ' : ' 7 أيام '));
  return t;
}

// "1 تشرين الثاني" / "1 Nov 2026" — reads well inside a sentence in either direction.
function niceDate(iso: string, lang: 'en' | 'ar') {
  try {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString(lang === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB', { day: 'numeric', month: lang === 'ar' ? 'long' : 'short', year: lang === 'ar' ? undefined : 'numeric', timeZone: 'UTC' });
  } catch {
    return iso;
  }
}

function addDays(iso: string, n: number) {
  return new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
}

function readDates(text: string, today: string): string[] {
  const iso = text.match(/\d{4}-\d{1,2}-\d{1,2}/g);
  if (iso) return iso.map((d) => d.split('-').map((x, i) => (i ? pad(Number(x)) : x)).join('-'));
  const slash = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g)];
  if (slash.length) return slash.map((m) => `${m[3] || today.slice(0, 4)}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`).map((d) => (d < today ? `${Number(d.slice(0, 4)) + 1}${d.slice(4)}` : d));
  const out: string[] = [];
  // "20 تشرين الثاني" / "20 نوفمبر"
  for (const [re, month] of AR_MONTHS) {
    const m = new RegExp('(\\d{1,2})\\s*(?:من\\s*)?(?:' + re.source + ')').exec(text);
    if (m) {
      let year = Number(today.slice(0, 4));
      let d = `${year}-${pad(month)}-${pad(Number(m[1]))}`;
      if (d < today) d = `${++year}-${pad(month)}-${pad(Number(m[1]))}`;
      out.push(d);
    }
  }
  if (out.length) return out;
  // Relative days: tomorrow, next week, next month.
  if (/tomorrow|باچر|باجر|بكرة|غداً|غدا/i.test(text)) return [addDays(today, 1)];
  if (/next week|الأسبوع الجاي|الاسبوع الجاي|الأسبوع القادم|الاسبوع القادم/i.test(text)) return [addDays(today, 7)];
  if (/next month|الشهر الجاي|الشهر القادم/i.test(text)) {
    const [y, m] = today.split('-').map(Number);
    return [m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`];
  }
  const re = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/gi;
  for (const m of text.matchAll(re)) {
    const day = Number(m[1] || m[4]);
    const month = MONTHS.indexOf((m[2] || m[3]).toLowerCase()) + 1;
    let year = Number(today.slice(0, 4));
    let d = `${year}-${pad(month)}-${pad(day)}`;
    if (d < today) d = `${++year}-${pad(month)}-${pad(day)}`;
    out.push(d);
  }
  return out;
}

export function mockReply(view: TurnView): string {
  const { ctx, draft, lang } = view;
  const text = normalize(view.lastUser);
  const lower = text.toLowerCase();
  const patch: Record<string, unknown> = {};

  const cities = ctx.cities.filter((c) => lower.includes(c.name.toLowerCase()) || lower.includes(c.slug) || text.includes(c.nameAr)).map((c) => c.slug);
  if (cities.length) patch.cities = [...new Set([...draft.cities, ...cities])];

  const dates = readDates(text, ctx.today);
  if (dates[0]) patch.startDate = dates[0];
  if (dates[1]) patch.endDate = dates[1];
  const days = /(\d+)\s*(?:days?|nights?|أيام|ايام|يوم)/i.exec(text);
  if (days) {
    patch.days = Number(days[1]);
    if (!dates[0] && draft.startDate) patch.startDate = draft.startDate;
  }

  const people = /(\d+)\s*(?:people|persons|person|of us|adults|travell?ers|guests|أشخاص|اشخاص|شخص|نفر|أفراد|افراد)/i.exec(text);
  if (people) patch.groupSize = Number(people[1]);
  else if (/\b(alone|solo|just me)\b|وحدي/i.test(text)) patch.groupSize = 1;
  else if (/my (wife|husband|partner)|\bcouple\b|me and my|(ويا|أنا و|انا و)\s?(زوجتي|زوجي)/i.test(text)) patch.groupSize = 2;

  const range = /\$\s?(\d+)\s*(?:-|–|to)\s*\$?\s?(\d+)/i.exec(text);
  const one = /\$\s?(\d+)|(\d+)\s*(?:\$|dollars?|usd|دولار|دولارات)/i.exec(text);
  if (range) Object.assign(patch, { budgetMin: Number(range[1]), budgetMax: Number(range[2]) });
  else if (one) patch.budgetMax = Number(one[1] || one[2]);

  const langs = LANG_WORDS.filter(([re]) => re.test(text)).map(([, code]) => code);
  if (langs.length) patch.languages = langs.slice(0, 3);
  else if (!draft.languages.length && /\p{Script=Arabic}/u.test(text)) patch.languages = ['ar'];
  else if (!draft.languages.length && /[a-z]{3,}/i.test(text)) patch.languages = ['en'];

  const interests = INTEREST_WORDS.filter(([re]) => re.test(text)).map(([, code]) => code);
  if (interests.length) patch.interests = [...new Set([...draft.interests, ...interests])].slice(0, 5);
  if (/female guide|woman guide|مرشدة/i.test(text)) patch.femaleGuide = true;

  const next = applyPatch(draft, patch, ctx);
  if (!next.description && view.lastUser.length > 20) patch.description = view.lastUser.trim().slice(0, 300);
  if (next.cities.length && next.title.trim().length < 5) {
    const names = next.cities.map((s) => ctx.cities.find((c) => c.slug === s)!).map((c) => (lang === 'ar' ? c.nameAr : c.name));
    const n = draftDays(next);
    patch.title = lang === 'ar' ? `رحلة إلى ${names.join(' و')}` : n ? `${n} days in ${names.join(' & ')}` : `Trip to ${names.join(' & ')}`;
  }

  const after = applyPatch(draft, patch, ctx);
  const { missing, problems } = checkDraft(after, ctx);
  const ask = ASK[lang];
  let reply: string;
  if (!missing.length) {
    reply =
      lang === 'ar'
        ? `رحلتك جاهزة: ${after.title}، من ${niceDate(after.startDate, 'ar')} إلى ${niceDate(after.endDate, 'ar')}، ${after.groupSize === 1 ? 'شخص واحد' : after.groupSize === 2 ? 'شخصين' : after.groupSize + ' أشخاص'}. اضغط "راجع رحلتي" حتى تتأكد منها وتنشرها.`
        : `Your trip is ready: ${after.title}, ${niceDate(after.startDate, 'en')} to ${niceDate(after.endDate, 'en')}, ${after.groupSize} ${after.groupSize === 1 ? 'person' : 'people'}. Tap "Review my trip" to check it and post it.`;
  } else {
    const lines: string[] = [];
    if (problems.some((p) => p.code === 'date_past')) lines.push(lang === 'ar' ? 'هذا التاريخ فات.' : 'That date has already passed.');
    if (problems.some((p) => p.code === 'trip_too_long')) lines.push(lang === 'ar' ? 'أطول رحلة ٣٠ يوم.' : 'Trips can be up to 30 days.');
    lines.push(...missing.filter((k) => k !== 'title').slice(0, 2).map((k) => ask[k]));
    reply = (Object.keys(patch).length ? (lang === 'ar' ? 'تمام! ' : 'Got it! ') : '') + lines.join(' ');
  }
  return JSON.stringify({ reply, patch, suggest: {} });
}

export function mockProvider(): AiProvider {
  return {
    name: 'mock',
    model: 'mock',
    async complete(req) {
      return mockReply(req.turn as TurnView);
    },
  };
}
