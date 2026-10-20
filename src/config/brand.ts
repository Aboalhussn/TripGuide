// Everything that names or styles the product lives here.
// To rename the app, change `name` and `nameAr`, and replace the logo files in /public/img (tg-*.svg).
export const brand = {
  name: 'Trip guide',
  nameAr: 'Trip guide',
  tagline: 'Post your trip. Iraqi guides send you offers.',
  taglineAr: 'انشر رحلتك، ودَع المرشدين العراقيين يرسلون عروضهم.',
  colors: {
    navy: '#053F5C',
    teal: '#429EBD',
    sky: '#9FE7F5',
    gold: '#F7AD19',
    paper: '#F3F8FA',
  },
};

// Business settings for the demo.
export const settings = {
  // Platform fee taken from the guide's side when a payment is released.
  feeRate: 0.1,
  // Shown next to USD prices as a guide only.
  iqdPerUsd: 1310,
  // A guide must confirm a hire within this many hours, or the hire lapses and the money is returned.
  confirmWindowHours: 48,
  // Reviews become visible when both sides have written theirs, or after this many days.
  reviewRevealDays: 14,
  // Simulated phone verification code.
  demoPhoneCode: '123456',
  // Show one-tap demo sign-in buttons on the sign-in screen. Turn off for a real launch.
  showDemoLogins: true,
};
