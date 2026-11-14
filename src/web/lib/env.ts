// Build settings. TG_ENV=production hides everything that only makes sense in a demo:
// the demo account picker, the shown reset code, the "demo mode" label on the card form and "reset demo data".
// A staging build (the default) keeps them.
export const IS_PRODUCTION: boolean = process.env.TG_ENV === 'production';
