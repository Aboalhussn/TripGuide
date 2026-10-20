// Demo data, built relative to "now" so the demo always looks current.
import { CITIES, PLACES } from './catalog';
import type { Booking, Data, GuideProfile, Offer, Platform, TripRequest, User } from './types';
import { addDays, dateRange, daysInclusive, iraqDate, money } from './util';
import { settings } from '../config/brand';

export const DEMO_PASSWORD = 'Demo@1234';
export const DEMO_ACCOUNTS = {
  tourist: 'tourist@tripguide.demo',
  guide: 'guide@tripguide.demo',
  admin: 'admin@tripguide.demo',
};

// Small deterministic random generator so the seed is the same every time.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function emptyData(now: Date): Data {
  return {
    version: 1,
    seededAt: now.toISOString(),
    seq: {},
    users: [],
    guides: [],
    cities: CITIES,
    places: PLACES,
    requests: [],
    offers: [],
    bookings: [],
    milestones: [],
    reviews: [],
    threads: [],
    messages: [],
    notifications: [],
    reports: [],
    sessions: [],
  };
}

type GuideSeed = {
  name: string;
  email: string;
  gender: 'm' | 'f';
  headline: string;
  headlineAr: string;
  bio: string;
  bioAr: string;
  price: number;
  cities: string[];
  languages: GuideProfile['languages'];
  specialities: string[];
  places: number[];
  photos: [string, string, string][];
  verification: GuideProfile['verification'];
  pastTours: number;
  replyMins: [number, number];
  ratingBias: number; // 0 = always 5 stars, higher = more 4s
};

const GUIDES: GuideSeed[] = [
  {
    name: 'Zainab Al-Rubaie', email: 'guide@tripguide.demo', gender: 'f',
    headline: 'Archaeologist and licensed guide. Babylon, Baghdad, Kish.',
    headlineAr: 'عالمة آثار ومرشدة مرخّصة. بابل وبغداد وكيش.',
    bio: "I studied archaeology at the University of Baghdad and have worked on digs at Babylon. I'll show you the Processional Way the way the excavators saw it, which bricks are original and which were rebuilt, and the best place for masgouf afterwards.",
    bioAr: 'درستُ الآثار في جامعة بغداد وعملتُ في تنقيبات بابل. سأريك شارع الموكب كما رآه المنقّبون، وأيّ الطابوق أصلي وأيّه أُعيد بناؤه، وأفضل مكان للمسگوف بعدها.',
    price: 60, cities: ['baghdad', 'babylon'], languages: [{ code: 'ar', level: 'native' }, { code: 'en', level: 'fluent' }, { code: 'de', level: 'basic' }],
    specialities: ['history', 'archaeology', 'museums', 'food'], places: [5, 4, 13, 14, 15, 16, 17, 18],
    photos: [['lib:babylon', 'The walls of Babylon', 'أسوار بابل'], ['lib:ishtar', 'At the Ishtar Gate', 'عند بوابة عشتار'], ['lib:brick-bull', 'Babylon, the glazed bulls', 'بابل، الثيران المزجّجة'], ['lib:ziggurat', 'Day trip to Borsippa', 'رحلة إلى برس نمرود']],
    verification: 'verified', pastTours: 14, replyMins: [12, 30], ratingBias: 0.15,
  },
  {
    name: 'Ali Hassan', email: 'ali@tripguide.demo', gender: 'm',
    headline: 'Old Baghdad walks, food and markets.',
    headlineAr: 'جولات بغداد القديمة، الأكل والأسواق.',
    bio: "Born in Bab al-Sheikh. My walks go from Al-Mutanabbi Street on a Friday morning to the copper market and the best kahi and gaimar breakfast in the city. I'm also a keen street photographer and happy to help with your shots.",
    bioAr: 'وُلدتُ في باب الشيخ. جولاتي تبدأ من شارع المتنبي صباح الجمعة إلى سوق الصفافير وأطيب فطور كاهي وگيمر في المدينة. أحب تصوير الشارع ويسعدني مساعدتك في صورك.',
    price: 40, cities: ['baghdad'], languages: [{ code: 'ar', level: 'native' }, { code: 'en', level: 'fluent' }],
    specialities: ['food', 'markets', 'photography', 'history'], places: [2, 3, 4, 5],
    photos: [['lib:skyline', 'Sunset over the Tigris', 'الغروب على دجلة'], ['lib:arch', 'Abbasid brickwork', 'الطابوق العباسي']],
    verification: 'verified', pastTours: 9, replyMins: [35, 90], ratingBias: 0.35,
  },
  {
    name: 'Omar Saad', email: 'omar@tripguide.demo', gender: 'm',
    headline: 'Najaf and Karbala. Shrines, pilgrim routes, scholarship.',
    headlineAr: 'النجف وكربلاء. المراقد ودروب الزائرين والحوزة.',
    bio: 'I have guided pilgrims and curious travellers for eight years. I explain the history of the shrines and the seminaries of Najaf with care, help with dress and etiquette, and know the quiet hours to visit.',
    bioAr: 'أرشد الزائرين والمسافرين منذ ثماني سنوات. أشرح تاريخ المراقد وحوزة النجف بعناية، وأساعد في اللباس والآداب، وأعرف الأوقات الهادئة للزيارة.',
    price: 45, cities: ['najaf', 'karbala'], languages: [{ code: 'ar', level: 'native' }, { code: 'fa', level: 'fluent' }, { code: 'en', level: 'good' }],
    specialities: ['religious', 'history'], places: [6, 7, 8, 9, 10, 11, 12],
    photos: [['lib:map', 'Planning a pilgrim route', 'تخطيط طريق الزيارة']],
    verification: 'verified', pastTours: 12, replyMins: [20, 60], ratingBias: 0.25,
  },
  {
    name: 'Noor Kareem', email: 'noor@tripguide.demo', gender: 'f',
    headline: 'Babylon and Hillah. Families welcome.',
    headlineAr: 'بابل والحلة. العائلات مرحّب بها.',
    bio: 'I grew up in Hillah, a few minutes from the ruins. I make Babylon fun for children with stories of the Hanging Gardens and the Tower, and my family can host you for lunch.',
    bioAr: 'نشأتُ في الحلة على بعد دقائق من الآثار. أجعل بابل ممتعة للأطفال بقصص الجنائن المعلّقة والبرج، ويمكن لعائلتي استضافتكم على الغداء.',
    price: 35, cities: ['babylon'], languages: [{ code: 'ar', level: 'native' }, { code: 'en', level: 'good' }],
    specialities: ['families', 'history'], places: [13, 14, 16],
    photos: [],
    verification: 'pending', pastTours: 2, replyMins: [60, 150], ratingBias: 0,
  },
  {
    name: 'Hussein Al-Musawi', email: 'hussein@tripguide.demo', gender: 'm',
    headline: 'Karbala guide for pilgrims from South Asia.',
    headlineAr: 'مرشد في كربلاء للزائرين من جنوب آسيا.',
    bio: 'I speak Urdu and help groups from Pakistan and India with everything from hotel pickup to the walk between the two shrines. Large groups are no problem.',
    bioAr: 'أتحدث الأردية وأساعد المجموعات القادمة من باكستان والهند في كل شيء، من الاستقبال في الفندق إلى المشي بين المرقدين. المجموعات الكبيرة ليست مشكلة.',
    price: 35, cities: ['karbala', 'najaf'], languages: [{ code: 'ar', level: 'native' }, { code: 'ur', level: 'fluent' }, { code: 'en', level: 'basic' }],
    specialities: ['religious'], places: [10, 11, 6],
    photos: [],
    verification: 'verified', pastTours: 8, replyMins: [25, 70], ratingBias: 0.3,
  },
  {
    name: 'Sara Mahmoud', email: 'sara@tripguide.demo', gender: 'f',
    headline: 'Erbil Citadel, bazaars and the road to Mosul.',
    headlineAr: 'قلعة أربيل والأسواق والطريق إلى الموصل.',
    bio: 'Kurdish and Arabic are my home languages. I show visitors the 6,000-year-old citadel, the Qaysari bazaar and, for those who want it, a day in Mosul to see the old city being rebuilt.',
    bioAr: 'الكردية والعربية لغتاي الأم. أُري الزوار القلعة التي يعود تاريخها إلى ستة آلاف عام، وسوق القيصرية، ولمن يرغب، يومًا في الموصل لرؤية المدينة القديمة وهي تُعمَّر من جديد.',
    price: 55, cities: ['erbil', 'mosul'], languages: [{ code: 'ku', level: 'native' }, { code: 'ar', level: 'fluent' }, { code: 'en', level: 'fluent' }],
    specialities: ['history', 'markets', 'architecture'], places: [21, 22, 26, 27],
    photos: [['lib:arch', 'Old gateways', 'البوابات القديمة']],
    verification: 'verified', pastTours: 7, replyMins: [15, 45], ratingBias: 0.2,
  },
  {
    name: 'Yousif Aziz', email: 'yousif@tripguide.demo', gender: 'm',
    headline: 'Architect showing Mosul old city and Nineveh.',
    headlineAr: 'مهندس معماري يعرّفك على الموصل القديمة ونينوى.',
    bio: "I'm an architect working on the reconstruction of Mosul's old city. I'll walk you through Al-Nouri Mosque, the churches and the old houses, and explain how they are being rebuilt stone by stone.",
    bioAr: 'أنا مهندس معماري أعمل في إعادة إعمار الموصل القديمة. سأمشي معك في جامع النوري والكنائس والبيوت القديمة، وأشرح كيف يُعاد بناؤها حجرًا حجرًا.',
    price: 50, cities: ['mosul'], languages: [{ code: 'ar', level: 'native' }, { code: 'en', level: 'good' }, { code: 'fr', level: 'basic' }],
    specialities: ['architecture', 'history'], places: [26, 27, 28],
    photos: [],
    verification: 'verified', pastTours: 5, replyMins: [40, 120], ratingBias: 0.3,
  },
  {
    name: 'Layla Jasim', email: 'layla@tripguide.demo', gender: 'f',
    headline: 'Basra and the marshes by boat.',
    headlineAr: 'البصرة والأهوار بالقارب.',
    bio: 'From the shanasheel houses of old Basra to sunrise on the Chibayish marshes, where we have tea with buffalo herders. I bring a good camera and know the birds.',
    bioAr: 'من شناشيل البصرة القديمة إلى شروق الشمس في أهوار الجبايش، حيث نشرب الشاي مع مربّي الجاموس. أحمل كاميرا جيدة وأعرف الطيور.',
    price: 50, cities: ['basra'], languages: [{ code: 'ar', level: 'native' }, { code: 'en', level: 'fluent' }],
    specialities: ['nature', 'food', 'photography'], places: [23, 24, 25],
    photos: [['lib:skyline', 'Palm groves', 'بساتين النخيل'], ['lib:wing', 'Flying into Basra', 'الوصول إلى البصرة']],
    verification: 'verified', pastTours: 6, replyMins: [20, 50], ratingBias: 0.1,
  },
  {
    name: 'Ahmed Kadhim', email: 'ahmed@tripguide.demo', gender: 'm',
    headline: 'Samarra and Baghdad. Abbasid history, photo trips.',
    headlineAr: 'سامراء وبغداد. التاريخ العباسي ورحلات التصوير.',
    bio: "Samarra was the Abbasid capital for half a century. I take small groups up the Malwiya at the right hour for photos, and explain why the city was built and abandoned so fast. I also speak Turkish.",
    bioAr: 'كانت سامراء عاصمة العباسيين نصف قرن. أصطحب المجموعات الصغيرة إلى الملوية في الساعة المناسبة للتصوير، وأشرح لماذا بُنيت المدينة وهُجرت بهذه السرعة. أتحدث التركية أيضًا.',
    price: 45, cities: ['samarra', 'baghdad'], languages: [{ code: 'ar', level: 'native' }, { code: 'en', level: 'good' }, { code: 'tr', level: 'good' }],
    specialities: ['archaeology', 'religious', 'photography'], places: [19, 20, 1, 3],
    photos: [['lib:arch', 'The Malwiya through the arch', 'الملوية من خلال القوس'], ['lib:malwiya', 'The Malwiya at golden hour', 'الملوية وقت الغروب']],
    verification: 'verified', pastTours: 6, replyMins: [30, 80], ratingBias: 0.25,
  },
  {
    name: 'Hamid Jaber', email: 'hamid@tripguide.demo', gender: 'm',
    headline: 'Day tours in Najaf.',
    headlineAr: 'جولات يومية في النجف.',
    bio: 'Day tours of the Imam Ali Shrine, the Old City and Wadi al-Salam. Affordable prices for students and families.',
    bioAr: 'جولات يومية في مرقد الإمام علي والمدينة القديمة ووادي السلام. أسعار مناسبة للطلاب والعائلات.',
    price: 30, cities: ['najaf'], languages: [{ code: 'ar', level: 'native' }, { code: 'en', level: 'basic' }],
    specialities: ['religious'], places: [6, 7, 9],
    photos: [],
    verification: 'none', pastTours: 3, replyMins: [240, 600], ratingBias: 0.6,
  },
];

const TOURISTS: [string, string, string, 'm' | 'f'][] = [
  ['Hannah Weber', 'tourist@tripguide.demo', 'Germany', 'f'],
  ['Marco Rossi', 'marco@tripguide.demo', 'Italy', 'm'],
  ['Lena de Vries', 'lena@tripguide.demo', 'Netherlands', 'f'],
  ['Yousef Al-Sabah', 'yousef@tripguide.demo', 'Kuwait', 'm'],
  ['Fatima Raza', 'fatima@tripguide.demo', 'Pakistan', 'f'],
  ['James Carter', 'james@tripguide.demo', 'United Kingdom', 'm'],
  ['Aiko Tanaka', 'aiko@tripguide.demo', 'Japan', 'f'],
  ['Reza Karimi', 'reza@tripguide.demo', 'Iran', 'm'],
  // Travellers from earlier tours, so guides have a history.
  ['Sophie Martin', 'sophie@tripguide.demo', 'France', 'f'],
  ['Daniel Kim', 'daniel@tripguide.demo', 'South Korea', 'm'],
  ['Emma Johansson', 'emma@tripguide.demo', 'Sweden', 'f'],
  ['Carlos Mendes', 'carlos@tripguide.demo', 'Brazil', 'm'],
  ['Mariam Khan', 'mariam@tripguide.demo', 'Pakistan', 'f'],
  ['Thomas Becker', 'thomas@tripguide.demo', 'Austria', 'm'],
  ['Olivia Brown', 'olivia@tripguide.demo', 'Australia', 'f'],
  ['Mehmet Yilmaz', 'mehmet@tripguide.demo', 'Turkey', 'm'],
  ['Ana Petrova', 'ana@tripguide.demo', 'Bulgaria', 'f'],
  ['Ali Rezaei', 'alirezaei@tripguide.demo', 'Iran', 'm'],
  ['Grace Lee', 'grace@tripguide.demo', 'Canada', 'f'],
  ['Pierre Dubois', 'pierre@tripguide.demo', 'Belgium', 'm'],
];

// Review comments written for each guide, so they match the guide's cities and style.
const GUIDE_REVIEWS: Record<string, string[]> = {
  'Zainab Al-Rubaie': [
    'Zainab made the bricks talk. We learned which parts of Babylon were original and which were rebuilt in the 1980s, and why that matters.',
    'Three hours in the Iraq Museum flew by. She knew the story behind every tablet.',
    'Deep knowledge, patient with all our questions, and she never rushed us.',
    'The Processional Way at opening time with nobody else there. Unforgettable.',
    'Lovely lunch in Hillah after Borsippa. She thought of everything.',
  ],
  'Ali Hassan': [
    'We ate our way through old Baghdad. Every stop was better than the last.',
    'Ali knew every shop owner on Al-Mutanabbi Street and we were treated like family.',
    'Great photo spots in the copper market. He was patient while we took our time.',
    'The kahi and gaimar breakfast alone was worth it.',
  ],
  'Omar Saad': [
    'Respectful and calm. Omar explained the etiquette before we arrived so we felt comfortable.',
    'He organised the visit around prayer times perfectly. Our elderly parents were well looked after.',
    'Clear history of Najaf and the seminaries without ever lecturing.',
  ],
  'Noor Kareem': ['Our kids loved the stories of the Hanging Gardens. Lunch with her family was the highlight.', 'Warm, funny and very good with children.'],
  'Hussein Al-Musawi': [
    'He speaks Urdu, which made all the difference for my mother.',
    'Managed our group of twelve without any stress. Very patient.',
    'He found us a quiet hour at the shrines. Highly recommended for families.',
  ],
  'Sara Mahmoud': ['The citadel at sunset and then the bazaar for dried fruit. Lovely day.', 'Sara knows Erbil and Mosul inside out. The day in the old city of Mosul was moving.'],
  'Yousif Aziz': ['Seeing the reconstruction of Mosul through the eyes of someone rebuilding it was moving.', 'He explained every arch and doorway. A must for anyone interested in buildings.'],
  'Layla Jasim': ['Sunrise on the marshes was unforgettable. The boat, the tea, the birds.', 'She found us flamingos. Enough said.', 'The shanasheel houses walk was beautiful and full of stories.'],
  'Ahmed Kadhim': ['Ahmed took us up the Malwiya early before the heat. Fascinating stories about the Abbasids.', 'He knew exactly where the light would be. My best photos of the trip.'],
  'Hamid Jaber': ['The tour was fine but short.', 'Good knowledge of the shrine, but he arrived late.', 'Cheap and okay for a quick visit.'],
};
const TOURIST_REVIEWS = ['Lovely group, on time every morning and curious about everything.', 'Clear about what they wanted and very respectful at the shrines.', 'A pleasure to guide. Welcome back any time.', 'Friendly and flexible when we had to change the plan.'];

const PLAN_LIBRARY: Record<string, [string, string][]> = {
  baghdad: [['Old Baghdad on foot', 'Al-Mutanabbi Street, Shabandar café, Al-Mustansiriya School and the Abbasid Palace.'], ['Iraq Museum and lunch', 'Three hours in the Iraq Museum, then masgouf by the Tigris.']],
  babylon: [['Babylon ruins', 'Ishtar Gate reconstruction, the Processional Way, the Southern Palace and the Lion.'], ['Kish and Borsippa', 'The ziggurat at Birs Nimrud and the mounds of Kish, lunch in Hillah.']],
  najaf: [['Najaf shrine and old city', 'Imam Ali Shrine, the old souq and a visit to Wadi al-Salam.']],
  karbala: [['Karbala shrines', 'Imam Husayn and Al-Abbas shrines, the walk between them, and the old market.']],
  samarra: [['Samarra', 'The Malwiya, the Great Mosque remains and Al-Askari Shrine.']],
  erbil: [['Erbil Citadel and bazaar', 'The citadel, the textile museum, then the Qaysari bazaar.']],
  mosul: [['Mosul old city', 'Al-Nouri Mosque and Al-Hadba, the old houses and the Nineveh walls.']],
  basra: [['Old Basra', 'Shanasheel houses, the corniche and a boat on the Shatt al-Arab.'], ['The marshes', 'Early drive to Chibayish, a boat into the marshes and tea with buffalo herders.']],
};

export function seed(platform: Platform): Data {
  const now = platform.now();
  const nowIso = now.toISOString();
  const today = iraqDate(now);
  const data = emptyData(now);
  const rand = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const ago = (days: number, hours = 0) => new Date(now.getTime() - days * 86400_000 - hours * 3600_000).toISOString();
  const minsAfter = (iso: string, mins: number) => new Date(Date.parse(iso) + mins * 60_000).toISOString();
  const hash = platform.hashPassword(DEMO_PASSWORD);
  const id = (t: string) => (data.seq[t] = (data.seq[t] || 0) + 1);

  const addUser = (role: User['role'], name: string, email: string, country: string, gender: 'm' | 'f', createdDaysAgo: number): User => {
    const u: User = {
      id: id('users'), role, name, email, passwordHash: hash, country, gender,
      avatarColor: data.users.length % 6, phone: role === 'admin' ? '' : '+964 770 000 ' + String(1000 + data.users.length).slice(-4),
      phoneVerified: role !== 'admin', paymentVerified: role === 'tourist', status: 'active', createdAt: ago(createdDaysAgo),
    };
    data.users.push(u);
    return u;
  };

  addUser('admin', 'Trip guide team', DEMO_ACCOUNTS.admin, 'Iraq', 'f', 420);
  const guideUsers: Record<string, User> = {};
  GUIDES.forEach((gs, i) => {
    const u = addUser('guide', gs.name, gs.email, 'Iraq', gs.gender, 600 - i * 40);
    guideUsers[gs.name] = u;
    data.guides.push({
      userId: u.id, headline: gs.headline, headlineAr: gs.headlineAr, bio: gs.bio, bioAr: gs.bioAr, pricePerDay: gs.price,
      cities: gs.cities, languages: gs.languages, specialities: gs.specialities, places: gs.places,
      photos: gs.photos.map(([img, caption, captionAr]) => ({ img, caption, captionAr })),
      blockedDates: [], verification: gs.verification, verificationNote: '',
      verificationDocs: gs.verification === 'none' ? [] : ['national-id-front.jpg', 'tourism-guide-licence.pdf'],
      verificationRequestedAt: gs.verification === 'none' ? null : ago(gs.verification === 'pending' ? 2 : 300),
    });
  });
  const tourists: Record<string, User> = {};
  TOURISTS.forEach(([name, email, country, gender], i) => (tourists[name] = addUser('tourist', name, email, country, gender, 300 - i * 9)));
  const T = (first: string) => Object.values(tourists).find((u) => u.name.startsWith(first))!;
  const G = (first: string) => Object.values(guideUsers).find((u) => u.name.startsWith(first))!;
  const gp = (u: User) => data.guides.find((g) => g.userId === u.id)!;

  // ---- helpers to build the marketplace objects ----
  const makeRequest = (tourist: User, f: Partial<TripRequest> & { title: string; cities: string[]; startDate: string; endDate: string }, createdAt: string): TripRequest => {
    const r: TripRequest = {
      id: id('requests'), touristId: tourist.id, description: '', places: [], groupSize: 2, languages: ['en'], interests: ['history'],
      budgetMin: 50, budgetMax: 150, urgent: false, femaleGuide: false, status: 'open', directGuideId: null, invited: [], createdAt, ...f,
    };
    data.requests.push(r);
    return r;
  };
  const planFor = (r: TripRequest): { title: string; details: string }[] =>
    dateRange(r.startDate, r.endDate).map((_, i) => {
      const lib = PLAN_LIBRARY[r.cities[i % r.cities.length]] || PLAN_LIBRARY.baghdad;
      const [title, details] = lib[Math.floor(i / r.cities.length) % lib.length];
      return { title, details };
    });
  const makeOffer = (r: TripRequest, guide: User, price: number, message: string, createdAt: string, extra: Partial<Offer> = {}): Offer => {
    const o: Offer = { id: id('offers'), requestId: r.id, guideId: guide.id, price, plan: planFor(r), includes: ['transport', 'tickets'], message, status: 'pending', shortlisted: false, createdAt, updatedAt: createdAt, ...extra };
    data.offers.push(o);
    return o;
  };
  const makeBooking = (r: TripRequest, o: Offer, status: Booking['status'], createdAt: string, extra: Partial<Booking> = {}): Booking => {
    const b: Booking = {
      id: id('bookings'), requestId: r.id, offerId: o.id, touristId: r.touristId, guideId: o.guideId, title: r.title, startDate: r.startDate, endDate: r.endDate,
      groupSize: r.groupSize, total: o.price, feeRate: settings.feeRate, status, statusBeforeDispute: null, createdAt,
      confirmBy: minsAfter(createdAt, settings.confirmWindowHours * 60), confirmedAt: status === 'awaiting_guide' ? null : minsAfter(createdAt, 90),
      completedAt: null, cancelledAt: null, cancelledBy: null, cancelReason: '', ...extra,
    };
    data.bookings.push(b);
    const days = dateRange(r.startDate, r.endDate);
    const each = Math.floor((o.price / days.length) * 100) / 100;
    days.forEach((date, i) =>
      data.milestones.push({ id: id('milestones'), bookingId: b.id, index: i, date, title: o.plan[i]?.title || `Day ${i + 1}`, amount: i === days.length - 1 ? money(o.price - each * (days.length - 1)) : each, status: 'held', fundedAt: createdAt, settledAt: null }),
    );
    return b;
  };
  const settle = (b: Booking, status: 'released' | 'refunded' | 'release_requested', upTo = Infinity, at?: string) => {
    for (const m of data.milestones.filter((m) => m.bookingId === b.id && m.index < upTo)) {
      m.status = status;
      m.settledAt = status === 'release_requested' ? null : at || `${m.date}T17:00:00.000Z`;
    }
  };
  const thread = (tourist: User, guide: User, r: TripRequest | null, convo: [0 | 1, string, number][], start: string) => {
    const t = { id: id('threads'), touristId: tourist.id, guideId: guide.id, requestId: r ? r.id : null, createdAt: start, lastAt: start, readAt: {} as Record<string, number> };
    data.threads.push(t);
    let at = start;
    for (const [who, body, mins] of convo) {
      at = minsAfter(at, mins);
      data.messages.push({ id: id('messages'), threadId: t.id, senderId: who === 0 ? tourist.id : guide.id, body, createdAt: at });
    }
    t.lastAt = at;
    t.readAt[tourist.id] = data.seq.messages || 0;
    t.readAt[guide.id] = data.seq.messages || 0;
    return t;
  };
  const review = (b: Booking, authorRole: 'tourist' | 'guide', overall: number, comment: string, at: string) => {
    const keys = authorRole === 'tourist' ? ['knowledge', 'communication', 'punctuality', 'value'] : ['communication', 'punctuality', 'respect'];
    const ratings: Record<string, number> = {};
    keys.forEach((k, i) => (ratings[k] = Math.max(1, Math.min(5, overall - (overall === 5 && i === keys.length - 1 && b.id % 4 === 0 ? 1 : 0)))));
    const avg = Math.round((Object.values(ratings).reduce((a, x) => a + x, 0) / keys.length) * 10) / 10;
    data.reviews.push({
      id: id('reviews'), bookingId: b.id, authorId: authorRole === 'tourist' ? b.touristId : b.guideId, subjectId: authorRole === 'tourist' ? b.guideId : b.touristId,
      authorRole, overall: avg, ratings, hireAgain: overall >= 4, comment, createdAt: at,
    });
  };

  // ---- history: completed tours for every guide ----
  const pastTourists = Object.values(tourists).slice(8);
  let tIndex = 0;
  GUIDES.forEach((gs, gi) => {
    const guide = guideUsers[gs.name];
    for (let k = 0; k < gs.pastTours; k++) {
      // Every few tours, the same traveller comes back (repeat hires).
      const tourist = k > 2 && k % 4 === 0 ? pastTourists[(tIndex - 3 + pastTourists.length) % pastTourists.length] : pastTourists[tIndex++ % pastTourists.length];
      // Each guide's most recent tour finished last week, so this month's earnings aren't empty.
      const daysBack = k === 0 ? 7 + (gi % 3) : 30 + Math.floor((k / Math.max(1, gs.pastTours)) * 300) + gi * 3;
      const len = 1 + Math.floor(rand() * 3);
      const start = addDays(today, -daysBack);
      const end = addDays(start, len - 1);
      const city = pick(gs.cities);
      const cityName = CITIES.find((c) => c.slug === city)!.name;
      const created = ago(daysBack + (k === 0 ? 4 : 12));
      const r = makeRequest(tourist, { title: len === 1 ? `Day tour of ${cityName}` : `${len} days in ${cityName}`, cities: [city], startDate: start, endDate: end, interests: gs.specialities.slice(0, 2), languages: ['en'], status: 'hired', groupSize: 1 + Math.floor(rand() * 4) }, created);
      const o = makeOffer(r, guide, gs.price * len, 'Happy to show you around. Here is my plan for your days.', minsAfter(created, 60), { status: 'accepted' });
      const b = makeBooking(r, o, 'completed', minsAfter(created, 600));
      b.completedAt = `${end}T18:00:00.000Z`;
      settle(b, 'released');
      const reply = gs.replyMins[0] + Math.floor(rand() * (gs.replyMins[1] - gs.replyMins[0]));
      thread(tourist, guide, r, [[0, 'Hello! Are you free on these dates?', 0], [1, 'Hello, yes I am. I sent you an offer with a plan.', reply], [0, 'Great, thank you.', 30]], minsAfter(created, 120));
      // Deterministic: roughly one review in 1/ratingBias gives four stars.
      const stars = gs.ratingBias >= 0.5 ? (k === 0 ? 4 : 3) : gs.ratingBias > 0 && k % Math.max(2, Math.round(1 / gs.ratingBias)) === 1 ? 4 : 5;
      const bank = GUIDE_REVIEWS[gs.name];
      review(b, 'tourist', stars, bank[k % bank.length], `${addDays(end, 1)}T10:00:00.000Z`);
      review(b, 'guide', 5, pick(TOURIST_REVIEWS), `${addDays(end, 1)}T12:00:00.000Z`);
    }
  });
  // Hamid once cancelled on a tourist.
  {
    const hamid = G('Hamid');
    const r = makeRequest(T('Sophie'), { title: 'Najaf day tour', cities: ['najaf'], startDate: addDays(today, -60), endDate: addDays(today, -60), status: 'closed', interests: ['religious'] }, ago(70));
    const o = makeOffer(r, hamid, 30, 'I can do it.', ago(69), { status: 'declined' });
    const b = makeBooking(r, o, 'cancelled', ago(68), { cancelledAt: ago(62), cancelledBy: 'guide', cancelReason: 'Family matter' });
    settle(b, 'refunded', Infinity, ago(62));
  }

  // ---- what's happening now ----
  const hannah = T('Hannah'), marco = T('Marco'), lena = T('Lena'), yousef = T('Yousef'), fatima = T('Fatima'), james = T('James'), aiko = T('Aiko'), reza = T('Reza');
  const zainab = G('Zainab'), ali = G('Ali'), omar = G('Omar'), noor = G('Noor'), hussein = G('Hussein'), sara = G('Sara'), layla = G('Layla'), ahmed = G('Ahmed'), hamid = G('Hamid'), yousif = G('Yousif');

  // 1. Hannah's open request with four offers to compare.
  const hr = makeRequest(hannah, {
    title: '3 days of ancient Babylon and Baghdad', cities: ['babylon', 'baghdad'], places: [14, 5], startDate: addDays(today, 25), endDate: addDays(today, 27),
    groupSize: 4, languages: ['en'], interests: ['history', 'archaeology', 'food'], budgetMin: 150, budgetMax: 250,
    description: "Two of us are architects. We'd love time at the Babylon walls. Hotel pickup in Baghdad, please.",
  }, ago(0, 6));
  const zo = makeOffer(hr, zainab, 210, "Architects! You'll love the Babylon walls. I'll bring the 1899 excavation plans so you can compare. Hotel pickup at 8:00 each day.", ago(0, 5.5), { shortlisted: true, includes: ['transport', 'tickets', 'pickup'] });
  zo.plan = [
    { title: 'Iraq Museum and Al-Mutanabbi', details: 'Iraq Museum in the morning, then Al-Mutanabbi Street and Shabandar café.' },
    { title: 'Kish and Borsippa', details: 'The ziggurat at Birs Nimrud and the mounds of Kish, lunch in Hillah.' },
    { title: 'Babylon at first light', details: 'Ishtar Gate, the Processional Way, the Southern Palace walls and the Lion.' },
  ];
  makeOffer(hr, noor, 135, 'I grew up next to the Babylon site in Hillah. My family can host you for lunch on day 2, and I will tell you the stories my grandmother told me.', ago(0, 4));
  makeOffer(hr, ali, 180, "Two days in Baghdad's old quarters with the best food stops, one full day in Babylon. I'll help with photos too.", ago(0, 3.5), { shortlisted: true, includes: ['tickets'] });
  makeOffer(hr, ahmed, 195, 'I can add a short stop in Samarra on the way if you like Abbasid architecture.', ago(0, 2));
  thread(hannah, zainab, hr, [[0, 'Hi Zainab! Is it possible to see the Babylon walls early, before it gets busy?', 0], [1, "Yes, the site opens at 8. Early light on the bricks is the best for photos.", 14], [1, "I can put Babylon on the last day so you're not rushed back to Baghdad.", 1], [0, "Perfect, let's do that. Does the price include the car?", 20], [1, 'It does: a 7-seat car with a driver, and all entry tickets.', 9]], ago(0, 5));
  for (const [g, price] of [[zainab, 210], [noor, 135], [ali, 180], [ahmed, 195]] as [User, number][])
    data.notifications.push({ id: id('notifications'), userId: hannah.id, type: 'offer_new', params: { name: g.name, title: hr.title, price }, link: `/requests/${hr.id}`, read: g === zainab, createdAt: ago(0, 2) });

  // 2. Hannah is on tour in Najaf and Karbala right now; day 1 is paid, Omar asked for day 2.
  const kr = makeRequest(hannah, { title: 'Karbala and Najaf in two days', cities: ['karbala', 'najaf'], startDate: addDays(today, -1), endDate: today, groupSize: 2, languages: ['en'], interests: ['religious', 'history'], budgetMin: 60, budgetMax: 120, status: 'hired' }, ago(20));
  const ko = makeOffer(kr, omar, 90, 'I will meet you at your hotel in Karbala and drive you to Najaf on the second day.', ago(19), { status: 'accepted' });
  const kb = makeBooking(kr, ko, 'confirmed', ago(18));
  const [kDay1, kDay2] = data.milestones.filter((m) => m.bookingId === kb.id).sort((a, b) => a.index - b.index);
  kDay1.status = 'released';
  kDay1.settledAt = ago(0, 14);
  kDay2.status = 'release_requested';
  thread(hannah, omar, kr, [[0, 'Hello Omar, we land in Najaf the night before. Is that a problem?', 0], [1, 'No problem, I will adjust. Please bring a scarf for the shrine.', 25], [1, 'Thank you for today. Tomorrow we start at 9 in Najaf.', 60 * 24 * 18]], ago(19));
  data.notifications.push({ id: id('notifications'), userId: hannah.id, type: 'release_requested', params: { name: omar.name, title: kb.title, amount: 45, day: 2 }, link: `/bookings/${kb.id}`, read: false, createdAt: ago(0, 1) });

  // 3. Hannah's finished Baghdad food walk with Ali: Ali reviewed her, she hasn't reviewed him yet.
  const fr = makeRequest(hannah, { title: 'Baghdad food walk', cities: ['baghdad'], startDate: addDays(today, -40), endDate: addDays(today, -40), groupSize: 2, interests: ['food', 'markets'], status: 'hired' }, ago(52));
  const fo = makeOffer(fr, ali, 40, 'Come hungry!', ago(51), { status: 'accepted' });
  const fb = makeBooking(fr, fo, 'completed', ago(50));
  fb.completedAt = `${addDays(today, -40)}T18:00:00.000Z`;
  settle(fb, 'released');
  data.reviews.push({ id: id('reviews'), bookingId: fb.id, authorId: ali.id, subjectId: hannah.id, authorRole: 'guide', overall: 5, ratings: { communication: 5, punctuality: 5, respect: 5 }, hireAgain: true, comment: 'Hannah was curious about everything and on time. Welcome back any time.', createdAt: ago(39) });

  // 4. Marco hired Zainab; she has to confirm.
  const mr = makeRequest(marco, { title: 'Babylon and Kish in 2 days', cities: ['babylon'], startDate: addDays(today, 33), endDate: addDays(today, 34), groupSize: 3, languages: ['en'], interests: ['archaeology'], budgetMin: 100, budgetMax: 160, status: 'awarded' }, ago(3));
  const mo = makeOffer(mr, zainab, 130, 'Two calm days in Babylon and Kish with plenty of time for questions.', ago(2.8), { status: 'awarded' });
  makeOffer(mr, noor, 80, 'I would be happy to guide you.', ago(2.5));
  const mb = makeBooking(mr, mo, 'awaiting_guide', ago(0, 2));
  data.notifications.push({ id: id('notifications'), userId: zainab.id, type: 'hired', params: { name: 'Marco R.', title: mr.title, price: 130 }, link: `/bookings/${mb.id}`, read: false, createdAt: ago(0, 2) });

  // 5. Zainab's upcoming confirmed tour with James.
  const jr = makeRequest(james, { title: 'Iraq Museum and old Baghdad', cities: ['baghdad'], startDate: addDays(today, 10), endDate: addDays(today, 11), groupSize: 1, interests: ['museums', 'history'], budgetMin: 80, budgetMax: 140, status: 'hired' }, ago(9));
  const jo = makeOffer(jr, zainab, 120, 'A slow, thorough day in the museum and a day in the old city.', ago(8.9), { status: 'accepted' });
  makeBooking(jr, jo, 'confirmed', ago(8));
  gp(zainab).blockedDates = [addDays(today, 15), addDays(today, 16), addDays(today, 17)];

  // 6. Lena's urgent day trip; she invited Zainab.
  const lr = makeRequest(lena, { title: 'Day trip to Babylon from Baghdad this week', cities: ['babylon'], places: [14, 16], startDate: addDays(today, 5), endDate: addDays(today, 5), groupSize: 2, languages: ['en'], interests: ['photography', 'history'], budgetMin: 50, budgetMax: 80, urgent: true, description: "We're photographers. We want early light at the Ishtar Gate and the Lion of Babylon, and we're happy to leave very early." }, ago(0, 9));
  lr.invited = [zainab.id];
  makeOffer(lr, noor, 60, 'I live in Hillah and can meet you at the site at sunrise.', ago(0, 7));
  makeOffer(lr, ali, 70, 'I can drive you from Baghdad at 5:00 and help with photos.', ago(0, 6));
  data.notifications.push({ id: id('notifications'), userId: zainab.id, type: 'invited', params: { name: 'Lena d.', title: lr.title }, link: `/requests/${lr.id}`, read: false, createdAt: ago(0, 8) });

  // 7. More open requests for guides to browse.
  const yr = makeRequest(yousef, { title: 'Family weekend: Baghdad old town and food', cities: ['baghdad'], startDate: addDays(today, 18), endDate: addDays(today, 19), groupSize: 5, languages: ['ar'], interests: ['food', 'families', 'markets'], budgetMin: 80, budgetMax: 120, description: 'نحن عائلة من الكويت مع ثلاثة أطفال. نريد أكلًا عراقيًا أصيلًا وأماكن مناسبة للأطفال.' }, ago(1));
  makeOffer(yr, ali, 90, 'أهلًا بكم في بغداد! عندي خطة مناسبة للأطفال مع أطيب الأكلات.', ago(0.8));
  makeOffer(yr, ahmed, 100, 'يسعدني مرافقتكم، ويمكن أن نضيف زيارة للكاظمية.', ago(0.6));
  const ftr = makeRequest(fatima, { title: 'Arbaeen-season visit to Karbala and Najaf, family of 8', cities: ['karbala', 'najaf'], startDate: addDays(today, 40), endDate: addDays(today, 43), groupSize: 8, languages: ['ur', 'en'], interests: ['religious'], budgetMin: 120, budgetMax: 220, description: 'Elderly parents with us, we need someone patient who speaks Urdu.' }, ago(0, 20));
  makeOffer(ftr, hussein, 150, 'میں اردو بولتا ہوں۔ I have guided many families with elderly parents.', ago(0, 18));
  makeRequest(aiko, { title: 'Erbil Citadel and a day in Mosul', cities: ['erbil', 'mosul'], startDate: addDays(today, 14), endDate: addDays(today, 15), groupSize: 1, languages: ['en'], interests: ['architecture', 'history'], budgetMin: 90, budgetMax: 140, directGuideId: sara.id, description: 'I saw your profile and would like you specifically, Sara.' }, ago(0, 4));
  data.notifications.push({ id: id('notifications'), userId: sara.id, type: 'direct_request', params: { name: 'Aiko T.', title: 'Erbil Citadel and a day in Mosul' }, link: `/requests/${data.requests.length}`, read: false, createdAt: ago(0, 4) });
  makeRequest(T('Sophie'), { title: 'Sunrise in the marshes', cities: ['basra'], places: [25], startDate: addDays(today, 21), endDate: addDays(today, 22), groupSize: 2, languages: ['en', 'fr'], interests: ['nature', 'photography'], budgetMin: 90, budgetMax: 130 }, ago(0, 15));
  makeRequest(T('Daniel'), { title: 'Samarra and the Malwiya for photographers', cities: ['samarra'], startDate: addDays(today, 9), endDate: addDays(today, 9), groupSize: 3, languages: ['en'], interests: ['photography', 'archaeology'], budgetMin: 40, budgetMax: 70 }, ago(1, 3));
  makeRequest(T('Mehmet'), { title: 'Babylon with a Turkish-speaking guide', cities: ['babylon', 'baghdad'], startDate: addDays(today, 28), endDate: addDays(today, 29), groupSize: 2, languages: ['tr', 'en'], interests: ['history'], budgetMin: 80, budgetMax: 130 }, ago(2));

  // 8. A disputed booking for the admin to resolve.
  const rr = makeRequest(reza, { title: 'Najaf day tour', cities: ['najaf'], startDate: addDays(today, -1), endDate: addDays(today, -1), groupSize: 2, languages: ['ar'], interests: ['religious'], budgetMin: 30, budgetMax: 60, status: 'hired' }, ago(6));
  const ro = makeOffer(rr, hamid, 55, 'I will wait at your hotel at 9.', ago(5.8), { status: 'accepted' });
  const rb = makeBooking(rr, ro, 'disputed', ago(5), { statusBeforeDispute: 'confirmed' });
  thread(reza, hamid, rr, [[0, 'We are at the hotel lobby. Where are you?', 0], [0, 'Hello? We have been waiting for an hour.', 60]], `${addDays(today, -1)}T06:00:00.000Z`);
  data.reports.push({ id: id('reports'), bookingId: rb.id, reporterId: reza.id, againstId: hamid.id, reason: 'no_show', details: "We waited at the hotel for two hours. He didn't answer messages or calls.", status: 'open', resolution: '', adminNote: '', createdAt: ago(0, 5), resolvedAt: null });
  data.notifications.push({ id: id('notifications'), userId: 1, type: 'report_new', params: { title: rb.title }, link: '/admin', read: false, createdAt: ago(0, 5) });
  data.notifications.push({ id: id('notifications'), userId: 1, type: 'verification_new', params: { name: noor.name }, link: '/admin', read: false, createdAt: ago(2) });

  // A couple of guide notifications to show the bell in use.
  data.notifications.push({ id: id('notifications'), userId: zainab.id, type: 'payment_released', params: { title: 'Day tour of Babylon', amount: 54, day: 1 }, link: '/wallet', read: true, createdAt: ago(3) });
  void yousif; void layla;

  // Keep Hannah's own message threads unread where it makes sense.
  {
    const t = data.threads.find((t) => t.touristId === hannah.id && t.guideId === zainab.id)!;
    t.readAt[hannah.id] = Math.max(...data.messages.filter((m) => m.threadId === t.id).map((m) => m.id)) - 2;
  }

  // Sanity: no seeded booking runs past 30 days; dates use real calendar days.
  for (const b of data.bookings) if (daysInclusive(b.startDate, b.endDate) > 30) throw new Error('bad seed');
  data.seededAt = nowIso;
  return data;
}
