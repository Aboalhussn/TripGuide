export type Role = 'tourist' | 'guide' | 'admin';

export interface User {
  id: number;
  role: Role;
  name: string;
  email: string;
  passwordHash: string;
  country: string;
  gender: 'm' | 'f';
  avatarColor: number; // index into the avatar palette
  avatar?: string | null; // uploaded profile photo (data URL), if any
  cover?: string | null; // uploaded cover photo shown behind the profile header, if any
  savedCard?: SavedCard | null; // a card kept for faster payments: never the full number or CVC
  phone: string;
  phoneVerified: boolean;
  paymentVerified: boolean;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface SavedCard { brand: string; last4: string; name: string; expiry: string }

export interface GuidePhoto { img: string; caption: string; captionAr: string }
export interface GuideLanguage { code: string; level: 'native' | 'fluent' | 'good' | 'basic' }

export type Verification = 'none' | 'pending' | 'verified' | 'rejected';

export interface GuideProfile {
  userId: number;
  headline: string;
  headlineAr: string;
  bio: string;
  bioAr: string;
  pricePerDay: number;
  cities: string[];
  languages: GuideLanguage[];
  specialities: string[];
  places: number[];
  photos: GuidePhoto[];
  blockedDates: string[]; // YYYY-MM-DD days the guide marked unavailable
  verification: Verification;
  verificationNote: string;
  verificationDocs: string[];
  verificationRequestedAt: string | null;
  acceptsCash: boolean; // offers cash payment (needs an active subscription)
  subscriptionUntil: string | null; // ISO time the guide's subscription runs until
  promotedUntil: string | null; // ISO time the guide's paid promotion (featured on the home screen) runs until
}

// covers: picture names in public/img, or 'm:<id>' for a photo the admin uploaded (kept in Data.media).
export interface City { slug: string; name: string; nameAr: string; covers?: string[] }
export interface Media { id: number; img: string }
export interface Place { id: number; city: string; name: string; nameAr: string; kind: 'archaeological' | 'religious' | 'heritage' | 'nature' | 'market' }

export type RequestStatus = 'open' | 'awarded' | 'hired' | 'closed';

export interface TripRequest {
  id: number;
  touristId: number;
  title: string;
  description: string;
  cities: string[];
  places: number[];
  startDate: string;
  endDate: string;
  groupSize: number;
  languages: string[];
  interests: string[];
  budgetMin: number;
  budgetMax: number;
  urgent: boolean;
  femaleGuide: boolean;
  status: RequestStatus;
  directGuideId: number | null; // set when the tourist hires a guide straight from their profile
  plan: PlanDay[]; // the tourist's own day-by-day wishes (optional; empty when none)
  cover?: string; // cover picture chosen from the trip's governorates (CITY_COVERS)
  invited: number[];
  createdAt: string;
}

export interface PlanDay { title: string; details: string }

export type OfferStatus = 'pending' | 'awarded' | 'accepted' | 'declined' | 'withdrawn' | 'not_selected';

export interface Offer {
  id: number;
  requestId: number;
  guideId: number;
  price: number;
  plan: PlanDay[];
  includes: string[];
  message: string;
  status: OfferStatus;
  shortlisted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'card' | 'cash';

export type BookingStatus = 'awaiting_guide' | 'confirmed' | 'completed' | 'cancelled' | 'declined' | 'expired' | 'disputed';

export interface Booking {
  id: number;
  requestId: number;
  offerId: number;
  touristId: number;
  guideId: number;
  title: string;
  startDate: string;
  endDate: string;
  groupSize: number;
  total: number;
  feeRate: number;
  paymentMethod: PaymentMethod;
  cardLast4: string;
  status: BookingStatus;
  statusBeforeDispute: BookingStatus | null;
  createdAt: string;
  confirmBy: string;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: Role | null;
  cancelReason: string;
}

// Card days: held -> (release_requested) -> released | refunded.
// Cash days: cash_due -> cash_paid (the guide confirms they were paid) | void (trip cancelled).
export type MilestoneStatus = 'held' | 'release_requested' | 'released' | 'refunded' | 'cash_due' | 'cash_paid' | 'void';

export interface Milestone {
  id: number;
  bookingId: number;
  index: number;
  date: string;
  title: string;
  amount: number;
  status: MilestoneStatus;
  fundedAt: string;
  settledAt: string | null;
}

export interface Review {
  id: number;
  bookingId: number;
  authorId: number;
  subjectId: number;
  authorRole: 'tourist' | 'guide';
  overall: number;
  ratings: Record<string, number>;
  hireAgain: boolean;
  comment: string;
  createdAt: string;
}

export interface Thread {
  id: number;
  touristId: number;
  guideId: number;
  requestId: number | null;
  createdAt: string;
  lastAt: string;
  readAt: Record<string, number>; // last message id each participant has seen
}

export interface Message {
  id: number;
  threadId: number;
  senderId: number;
  body: string;
  createdAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  type: string;
  params: Record<string, string | number>;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface Report {
  id: number;
  bookingId: number;
  reporterId: number;
  againstId: number;
  reason: string;
  details: string;
  status: 'open' | 'resolved';
  resolution: '' | 'refund' | 'release' | 'dismiss';
  adminNote: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CardPayment {
  id: number;
  userId: number;
  purpose: 'booking' | 'subscription' | 'promotion';
  refId: number; // booking id, or the guide's user id for a subscription
  amount: number;
  brand: string;
  last4: string;
  status: 'succeeded';
  createdAt: string;
}

export interface PlatformSettings {
  guideSubscriptionPrice: number; // USD per period, set by the admin
  subscriptionDays: number;
  promotionPrice: number; // USD to be featured on the home screen, set by the admin
  promotionDays: number;
  iqdPerUsd: number; // exchange rate shown next to USD prices, set by the admin
}

export interface Session { token: string; userId: number; createdAt: string }

export interface Data {
  version: number;
  seededAt: string;
  seq: Record<string, number>;
  users: User[];
  guides: GuideProfile[];
  cities: City[];
  places: Place[];
  media?: Media[];
  requests: TripRequest[];
  offers: Offer[];
  bookings: Booking[];
  milestones: Milestone[];
  reviews: Review[];
  threads: Thread[];
  messages: Message[];
  notifications: Notification[];
  reports: Report[];
  sessions: Session[];
  payments: CardPayment[];
  platform: PlatformSettings;
}

// What the core needs from the platform it runs on (Node server or the in-browser demo).
export interface Platform {
  now(): Date;
  hashPassword(password: string): string;
  verifyPassword(password: string, hash: string): boolean;
  randomToken(): string;
}

export interface ApiRequest {
  method: string;
  path: string; // without /api prefix, e.g. /guides/3
  query: Record<string, string>;
  body: any;
  token: string | null;
}

export interface ApiResponse {
  status: number;
  body: any;
}
