// The database: everything in src/core/types.ts, plus users.phone, sessions, audit log and media.
// Ids are plain integers handed out by the `counters` table, so numbering is the same as the demo engine's.
// Amounts are `numeric` (exact). Times are timestamptz with milliseconds. Days are `date` (YYYY-MM-DD).
import { boolean, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, precision: 3, mode: 'date' });
const day = (name: string) => date(name, { mode: 'string' });
const amount = (name: string) => numeric(name, { mode: 'number' });

// One row per table: the last id handed out (the engine's data.seq).
export const counters = pgTable('counters', {
  name: text('name').primaryKey(),
  value: integer('value').notNull().default(0),
});

export const users = pgTable(
  'users',
  {
    id: integer('id').primaryKey(),
    role: text('role').$type<'tourist' | 'guide' | 'admin'>().notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(), // lower case; '' only for the state account when no email is set
    phone: text('phone').notNull(), // E.164, e.g. +9647713111325
    passwordHash: text('password_hash').notNull(),
    country: text('country').notNull(),
    gender: text('gender').$type<'m' | 'f'>().notNull(),
    avatarColor: integer('avatar_color').notNull(),
    avatar: text('avatar'), // 'u:<storage key>' of the uploaded photo
    cover: text('cover'),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    paymentVerified: boolean('payment_verified').notNull().default(false),
    status: text('status').$type<'active' | 'suspended'>().notNull().default('active'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [uniqueIndex('users_phone_key').on(t.phone), uniqueIndex('users_email_key').on(t.email).where(sqlNotEmpty('email'))],
);

// Only the brand, last four digits, name and expiry are ever kept: never the full number or the CVC.
export const savedCards = pgTable('saved_cards', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  brand: text('brand').notNull(),
  last4: text('last4').notNull(),
  name: text('name').notNull(),
  expiry: text('expiry').notNull(),
});

export const guideProfiles = pgTable('guide_profiles', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  headline: text('headline').notNull().default(''),
  headlineAr: text('headline_ar').notNull().default(''),
  bio: text('bio').notNull().default(''),
  bioAr: text('bio_ar').notNull().default(''),
  pricePerDay: amount('price_per_day').notNull(),
  cities: text('cities').array().notNull(),
  languages: jsonb('languages').$type<{ code: string; level: 'native' | 'fluent' | 'good' | 'basic' }[]>().notNull(),
  specialities: text('specialities').array().notNull(),
  places: integer('places').array().notNull(),
  blockedDates: text('blocked_dates').array().notNull(),
  verification: text('verification').$type<'none' | 'pending' | 'verified' | 'rejected'>().notNull().default('none'),
  verificationNote: text('verification_note').notNull().default(''),
  verificationDocs: text('verification_docs').array().notNull(),
  verificationRequestedAt: ts('verification_requested_at'),
  acceptsCash: boolean('accepts_cash').notNull().default(false),
  subscriptionUntil: ts('subscription_until'),
  promotedUntil: ts('promoted_until'),
});

export const guidePhotos = pgTable(
  'guide_photos',
  {
    guideId: integer('guide_id').notNull().references(() => guideProfiles.userId, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    img: text('img').notNull(), // 'lib:<name>' (built-in picture) or 'u:<storage key>'
    caption: text('caption').notNull().default(''),
    captionAr: text('caption_ar').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.guideId, t.position] })],
);

// ID front, ID back and residence card. Private: only the state (admin) ever sees them, through short-lived signed links.
export const verificationPhotos = pgTable('verification_photos', {
  guideId: integer('guide_id').primaryKey().references(() => guideProfiles.userId, { onDelete: 'cascade' }),
  idFront: text('id_front').notNull(),
  idBack: text('id_back').notNull(),
  residence: text('residence').notNull(),
});

export const cities = pgTable('cities', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  nameAr: text('name_ar').notNull(),
  position: integer('position').notNull(),
  covers: text('covers').array().notNull(), // picture names in public/img, or 'm:<id>'
});

export const places = pgTable('places', {
  id: integer('id').primaryKey(),
  city: text('city').notNull().references(() => cities.slug),
  name: text('name').notNull(),
  nameAr: text('name_ar').notNull(),
  kind: text('kind').$type<'archaeological' | 'religious' | 'heritage' | 'nature' | 'market'>().notNull(),
});

// Photos the state uploads for governorates and events. The API keeps calling them 'm:<id>'.
export const media = pgTable('media', {
  id: integer('id').primaryKey(),
  key: text('key').notNull(), // storage key
  createdAt: ts('created_at').notNull(),
});

// Every file put in storage, public or private, so nothing is orphaned or mis-served.
export const uploads = pgTable('uploads', {
  key: text('key').primaryKey(),
  ownerId: integer('owner_id'),
  kind: text('kind').notNull(), // avatar | cover | guide | passport | id | media
  contentType: text('content_type').notNull(),
  bytes: integer('bytes').notNull(),
  private: boolean('private').notNull().default(false),
  createdAt: ts('created_at').notNull(),
});

export const specialEvents = pgTable('special_events', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  titleAr: text('title_ar').notNull(),
  description: text('description').notNull().default(''),
  descriptionAr: text('description_ar').notNull().default(''),
  city: text('city').notNull(),
  venue: text('venue').notNull().default(''),
  venueAr: text('venue_ar').notNull().default(''),
  startDate: day('start_date').notNull(),
  endDate: day('end_date').notNull(),
  img: text('img').notNull(),
  createdAt: ts('created_at').notNull(),
});

// One row: prices, periods and the dollar-to-dinar rate the state sets.
export const platformSettings = pgTable('platform_settings', {
  id: integer('id').primaryKey().default(1),
  guideSubscriptionPrice: amount('guide_subscription_price').notNull(),
  subscriptionDays: integer('subscription_days').notNull(),
  promotionPrice: amount('promotion_price').notNull(),
  promotionDays: integer('promotion_days').notNull(),
  iqdPerUsd: integer('iqd_per_usd').notNull(),
  seededAt: ts('seeded_at').notNull(),
});

export const tripRequests = pgTable(
  'trip_requests',
  {
    id: integer('id').primaryKey(),
    touristId: integer('tourist_id').notNull().references(() => users.id),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    cities: text('cities').array().notNull(),
    places: integer('places').array().notNull(),
    startDate: day('start_date').notNull(),
    endDate: day('end_date').notNull(),
    groupSize: integer('group_size').notNull(),
    languages: text('languages').array().notNull(),
    interests: text('interests').array().notNull(),
    budgetMin: amount('budget_min').notNull(),
    budgetMax: amount('budget_max').notNull(),
    urgent: boolean('urgent').notNull().default(false),
    femaleGuide: boolean('female_guide').notNull().default(false),
    status: text('status').$type<'open' | 'awarded' | 'hired' | 'closed'>().notNull(),
    directGuideId: integer('direct_guide_id'),
    plan: jsonb('plan').$type<{ title: string; details: string }[]>().notNull(), // the tourist's optional day plan
    cover: text('cover'),
    invited: integer('invited').array().notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('trip_requests_tourist_idx').on(t.touristId), index('trip_requests_status_idx').on(t.status)],
);

export const offers = pgTable(
  'offers',
  {
    id: integer('id').primaryKey(),
    requestId: integer('request_id').notNull().references(() => tripRequests.id),
    guideId: integer('guide_id').notNull().references(() => users.id),
    price: amount('price').notNull(),
    plan: jsonb('plan').$type<{ title: string; details: string }[]>().notNull(), // one entry per day
    includes: text('includes').array().notNull(),
    message: text('message').notNull(),
    status: text('status').$type<'pending' | 'awarded' | 'accepted' | 'declined' | 'withdrawn' | 'not_selected'>().notNull(),
    shortlisted: boolean('shortlisted').notNull().default(false),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [index('offers_request_idx').on(t.requestId), index('offers_guide_idx').on(t.guideId)],
);

export const bookings = pgTable(
  'bookings',
  {
    id: integer('id').primaryKey(),
    requestId: integer('request_id').notNull().references(() => tripRequests.id),
    offerId: integer('offer_id').notNull().references(() => offers.id),
    touristId: integer('tourist_id').notNull().references(() => users.id),
    guideId: integer('guide_id').notNull().references(() => users.id),
    title: text('title').notNull(),
    startDate: day('start_date').notNull(),
    endDate: day('end_date').notNull(),
    groupSize: integer('group_size').notNull(),
    total: amount('total').notNull(),
    feeRate: amount('fee_rate').notNull(),
    paymentMethod: text('payment_method').$type<'card' | 'cash'>().notNull(),
    cardLast4: text('card_last4').notNull().default(''),
    status: text('status').$type<'awaiting_guide' | 'confirmed' | 'completed' | 'cancelled' | 'declined' | 'expired' | 'disputed'>().notNull(),
    statusBeforeDispute: text('status_before_dispute').$type<'awaiting_guide' | 'confirmed' | 'completed' | 'cancelled' | 'declined' | 'expired' | 'disputed'>(),
    createdAt: ts('created_at').notNull(),
    confirmBy: ts('confirm_by').notNull(),
    confirmedAt: ts('confirmed_at'),
    completedAt: ts('completed_at'),
    cancelledAt: ts('cancelled_at'),
    cancelledBy: text('cancelled_by').$type<'tourist' | 'guide' | 'admin'>(),
    cancelReason: text('cancel_reason').notNull().default(''),
  },
  (t) => [index('bookings_tourist_idx').on(t.touristId), index('bookings_guide_idx').on(t.guideId), index('bookings_status_idx').on(t.status, t.confirmBy)],
);

export const milestones = pgTable(
  'milestones',
  {
    id: integer('id').primaryKey(),
    bookingId: integer('booking_id').notNull().references(() => bookings.id),
    index: integer('idx').notNull(),
    date: day('date').notNull(),
    title: text('title').notNull(),
    amount: amount('amount').notNull(),
    status: text('status').$type<'held' | 'release_requested' | 'released' | 'refunded' | 'cash_due' | 'cash_paid' | 'void'>().notNull(),
    fundedAt: ts('funded_at').notNull(),
    settledAt: ts('settled_at'),
  },
  (t) => [index('milestones_booking_idx').on(t.bookingId)],
);

export const payments = pgTable(
  'payments',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    purpose: text('purpose').$type<'booking' | 'subscription' | 'promotion'>().notNull(),
    refId: integer('ref_id').notNull(),
    amount: amount('amount').notNull(),
    brand: text('brand').notNull(),
    last4: text('last4').notNull(),
    status: text('status').$type<'succeeded'>().notNull(),
    provider: text('provider').notNull().default('simulated'),
    providerRef: text('provider_ref').notNull().default(''),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('payments_user_idx').on(t.userId)],
);

// The money ledger: one line per movement, written in the same transaction as the movement itself.
export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    kind: text('kind').notNull(), // paid_in | released | refunded | cash | subscription | promotion | withdrawn
    bookingId: integer('booking_id'),
    milestoneId: integer('milestone_id'),
    amount: amount('amount').notNull(),
    fee: amount('fee').notNull().default(0),
    at: ts('at').notNull(),
  },
  (t) => [index('wallet_tx_user_idx').on(t.userId)],
);

export const withdrawals = pgTable(
  'withdrawals',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    amount: amount('amount').notNull(),
    brand: text('brand').notNull(),
    last4: text('last4').notNull(),
    providerRef: text('provider_ref').notNull().default(''),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('withdrawals_user_idx').on(t.userId)],
);

export const threads = pgTable(
  'threads',
  {
    id: integer('id').primaryKey(),
    touristId: integer('tourist_id').notNull().references(() => users.id),
    guideId: integer('guide_id').notNull().references(() => users.id),
    requestId: integer('request_id'),
    createdAt: ts('created_at').notNull(),
    lastAt: ts('last_at').notNull(),
    readAt: jsonb('read_at').$type<Record<string, number>>().notNull(), // last message id each participant has seen
  },
  (t) => [index('threads_tourist_idx').on(t.touristId), index('threads_guide_idx').on(t.guideId)],
);

export const messages = pgTable(
  'messages',
  {
    id: integer('id').primaryKey(),
    threadId: integer('thread_id').notNull().references(() => threads.id),
    senderId: integer('sender_id').notNull().references(() => users.id),
    body: text('body').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('messages_thread_idx').on(t.threadId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: integer('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    type: text('type').notNull(),
    params: jsonb('params').$type<Record<string, string | number>>().notNull(),
    link: text('link').notNull(),
    read: boolean('read').notNull().default(false),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.read)],
);

export const reviews = pgTable(
  'reviews',
  {
    id: integer('id').primaryKey(),
    bookingId: integer('booking_id').notNull().references(() => bookings.id),
    authorId: integer('author_id').notNull().references(() => users.id),
    subjectId: integer('subject_id').notNull().references(() => users.id),
    authorRole: text('author_role').$type<'tourist' | 'guide'>().notNull(),
    overall: amount('overall').notNull(),
    ratings: jsonb('ratings').$type<Record<string, number>>().notNull(),
    hireAgain: boolean('hire_again').notNull(),
    comment: text('comment').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [uniqueIndex('reviews_booking_author_key').on(t.bookingId, t.authorId), index('reviews_subject_idx').on(t.subjectId)],
);

export const reports = pgTable(
  'reports',
  {
    id: integer('id').primaryKey(),
    bookingId: integer('booking_id').notNull().references(() => bookings.id),
    reporterId: integer('reporter_id').notNull().references(() => users.id),
    againstId: integer('against_id').notNull().references(() => users.id),
    reason: text('reason').notNull(),
    details: text('details').notNull(),
    status: text('status').$type<'open' | 'resolved'>().notNull(),
    resolution: text('resolution').$type<'' | 'refund' | 'release' | 'dismiss'>().notNull().default(''),
    adminNote: text('admin_note').notNull().default(''),
    createdAt: ts('created_at').notNull(),
    resolvedAt: ts('resolved_at'),
  },
  (t) => [index('reports_status_idx').on(t.status)],
);

// A page of a tourist's travel passport. Page numbers start at 1 for each tourist.
export const passportPages = pgTable(
  'passport_pages',
  {
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    id: integer('id').notNull(),
    img: text('img').notNull(), // 'lib:<name>' or 'u:<storage key>'
    place: text('place').notNull(),
    city: text('city').notNull(),
    date: day('date').notNull(),
    note: text('note').notNull().default(''),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

// Sign-in tokens: random, stored hashed (SHA-256), with an expiry. Deleted on sign-out and password change.
export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// A forgot-password code sent by SMS: kept hashed, valid 15 minutes, 5 tries.
export const passwordResets = pgTable('password_resets', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  tries: integer('tries').notNull().default(0),
});

// A phone verification code sent by SMS (production). The demo code from the settings is used on staging.
export const phoneCodes = pgTable('phone_codes', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  tries: integer('tries').notNull().default(0),
});

// Every action the state (admin) takes.
export const auditLog = pgTable(
  'audit_log',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    adminId: integer('admin_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull(),
    ip: text('ip').notNull().default(''),
    at: ts('at').notNull(),
  },
  (t) => [index('audit_log_at_idx').on(t.at)],
);

import { sql } from 'drizzle-orm';
function sqlNotEmpty(column: string) {
  return sql.raw(`"${column}" <> ''`);
}
