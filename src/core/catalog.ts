import type { City, Place } from './types';

export const CITIES: City[] = [
  { slug: 'baghdad', name: 'Baghdad', nameAr: 'بغداد' },
  { slug: 'babylon', name: 'Babylon', nameAr: 'بابل' },
  { slug: 'karbala', name: 'Karbala', nameAr: 'كربلاء' },
  { slug: 'najaf', name: 'Najaf', nameAr: 'النجف' },
  { slug: 'samarra', name: 'Samarra', nameAr: 'سامراء' },
  { slug: 'erbil', name: 'Erbil', nameAr: 'أربيل' },
  { slug: 'basra', name: 'Basra', nameAr: 'البصرة' },
  { slug: 'mosul', name: 'Mosul', nameAr: 'الموصل' },
];

// The first 18 places come from the earlier version of the app.
export const PLACES: Place[] = [
  { id: 1, city: 'baghdad', name: 'Al-Kadhimiya Shrine', nameAr: 'مرقد الإمامين الكاظمين', kind: 'religious' },
  { id: 2, city: 'baghdad', name: 'Al-Mustansiriya School', nameAr: 'المدرسة المستنصرية', kind: 'heritage' },
  { id: 3, city: 'baghdad', name: 'Abbasid Palace', nameAr: 'القصر العباسي', kind: 'archaeological' },
  { id: 4, city: 'baghdad', name: 'Al-Mutanabbi Street', nameAr: 'شارع المتنبي', kind: 'market' },
  { id: 5, city: 'baghdad', name: 'Iraq National Museum', nameAr: 'المتحف الوطني العراقي', kind: 'heritage' },
  { id: 6, city: 'najaf', name: 'Imam Ali Shrine', nameAr: 'مرقد الإمام علي بن أبي طالب', kind: 'religious' },
  { id: 7, city: 'najaf', name: 'Wadi al-Salam Cemetery', nameAr: 'مقبرة وادي السلام', kind: 'religious' },
  { id: 8, city: 'najaf', name: 'Great Mosque of Kufa', nameAr: 'مسجد الكوفة', kind: 'religious' },
  { id: 9, city: 'najaf', name: 'Najaf Old City', nameAr: 'مدينة النجف القديمة', kind: 'heritage' },
  { id: 10, city: 'karbala', name: 'Imam Husayn Shrine', nameAr: 'مرقد الإمام الحسين', kind: 'religious' },
  { id: 11, city: 'karbala', name: 'Al-Abbas Shrine', nameAr: 'مرقد العباس بن علي', kind: 'religious' },
  { id: 12, city: 'karbala', name: 'Al-Ukhaidir Fortress', nameAr: 'قصر الأخيضر', kind: 'archaeological' },
  { id: 13, city: 'babylon', name: 'Ancient City of Babylon', nameAr: 'مدينة بابل الأثرية', kind: 'archaeological' },
  { id: 14, city: 'babylon', name: 'Ishtar Gate (reconstruction)', nameAr: 'بوابة عشتار', kind: 'archaeological' },
  { id: 15, city: 'babylon', name: "Nebuchadnezzar's Southern Palace", nameAr: 'قصر نبوخذنصر الجنوبي', kind: 'archaeological' },
  { id: 16, city: 'babylon', name: 'Lion of Babylon', nameAr: 'أسد بابل', kind: 'archaeological' },
  { id: 17, city: 'babylon', name: 'Borsippa (Birs Nimrud)', nameAr: 'برس نمرود (بورسيبا)', kind: 'archaeological' },
  { id: 18, city: 'babylon', name: 'Kish (Tell Uhaimir)', nameAr: 'كيش (تل الأحيمر)', kind: 'archaeological' },
  { id: 19, city: 'samarra', name: 'Malwiya Minaret', nameAr: 'منارة الملوية', kind: 'archaeological' },
  { id: 20, city: 'samarra', name: 'Al-Askari Shrine', nameAr: 'مرقد الإمامين العسكريين', kind: 'religious' },
  { id: 21, city: 'erbil', name: 'Erbil Citadel', nameAr: 'قلعة أربيل', kind: 'heritage' },
  { id: 22, city: 'erbil', name: 'Qaysari Bazaar', nameAr: 'سوق القيصرية', kind: 'market' },
  { id: 23, city: 'basra', name: 'Shanasheel houses of Old Basra', nameAr: 'شناشيل البصرة القديمة', kind: 'heritage' },
  { id: 24, city: 'basra', name: 'Shatt al-Arab Corniche', nameAr: 'كورنيش شط العرب', kind: 'nature' },
  { id: 25, city: 'basra', name: 'Mesopotamian Marshes (Chibayish)', nameAr: 'أهوار الجبايش', kind: 'nature' },
  { id: 26, city: 'mosul', name: 'Al-Nouri Mosque and Al-Hadba Minaret', nameAr: 'جامع النوري ومنارة الحدباء', kind: 'heritage' },
  { id: 27, city: 'mosul', name: 'Mosul Old City', nameAr: 'الموصل القديمة', kind: 'heritage' },
  { id: 28, city: 'mosul', name: 'Nineveh city walls', nameAr: 'أسوار نينوى', kind: 'archaeological' },
];

export const LANGUAGES = ['ar', 'en', 'ku', 'fa', 'tr', 'ur', 'fr', 'de', 'es', 'it', 'ru', 'zh'];
export const LANGUAGE_LEVELS = ['native', 'fluent', 'good', 'basic'] as const;

// Used both for what tourists are into and what guides specialise in.
export const INTERESTS = ['history', 'archaeology', 'religious', 'food', 'photography', 'markets', 'architecture', 'nature', 'museums', 'families'];

export const INCLUDES = ['transport', 'tickets', 'meals', 'pickup', 'water'];

export const GUIDE_RATING_KEYS = ['knowledge', 'communication', 'punctuality', 'value'];
export const TOURIST_RATING_KEYS = ['communication', 'punctuality', 'respect'];

export const AVATAR_COLORS = 6;

export const PHOTO_LIBRARY = ['ishtar', 'gate', 'babylon', 'arch', 'brick-bull', 'malwiya', 'ziggurat', 'skyline', 'map', 'wing'];
