CREATE TABLE "audit_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"admin_id" integer NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"details" jsonb NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" integer PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"offer_id" integer NOT NULL,
	"tourist_id" integer NOT NULL,
	"guide_id" integer NOT NULL,
	"title" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"group_size" integer NOT NULL,
	"total" numeric NOT NULL,
	"fee_rate" numeric NOT NULL,
	"payment_method" text NOT NULL,
	"card_last4" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"status_before_dispute" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"confirm_by" timestamp (3) with time zone NOT NULL,
	"confirmed_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	"cancelled_at" timestamp (3) with time zone,
	"cancelled_by" text,
	"cancel_reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"position" integer NOT NULL,
	"covers" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_photos" (
	"guide_id" integer NOT NULL,
	"position" integer NOT NULL,
	"img" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"caption_ar" text DEFAULT '' NOT NULL,
	CONSTRAINT "guide_photos_guide_id_position_pk" PRIMARY KEY("guide_id","position")
);
--> statement-breakpoint
CREATE TABLE "guide_profiles" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"headline_ar" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"bio_ar" text DEFAULT '' NOT NULL,
	"price_per_day" numeric NOT NULL,
	"cities" text[] NOT NULL,
	"languages" jsonb NOT NULL,
	"specialities" text[] NOT NULL,
	"places" integer[] NOT NULL,
	"blocked_dates" text[] NOT NULL,
	"verification" text DEFAULT 'none' NOT NULL,
	"verification_note" text DEFAULT '' NOT NULL,
	"verification_docs" text[] NOT NULL,
	"verification_requested_at" timestamp (3) with time zone,
	"accepts_cash" boolean DEFAULT false NOT NULL,
	"subscription_until" timestamp (3) with time zone,
	"promoted_until" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" integer PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" integer PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" integer PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"idx" integer NOT NULL,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"amount" numeric NOT NULL,
	"status" text NOT NULL,
	"funded_at" timestamp (3) with time zone NOT NULL,
	"settled_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" integer PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"params" jsonb NOT NULL,
	"link" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" integer PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"guide_id" integer NOT NULL,
	"price" numeric NOT NULL,
	"plan" jsonb NOT NULL,
	"includes" text[] NOT NULL,
	"message" text NOT NULL,
	"status" text NOT NULL,
	"shortlisted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passport_pages" (
	"user_id" integer NOT NULL,
	"id" integer NOT NULL,
	"img" text NOT NULL,
	"place" text NOT NULL,
	"city" text NOT NULL,
	"date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "passport_pages_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"tries" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" integer PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"purpose" text NOT NULL,
	"ref_id" integer NOT NULL,
	"amount" numeric NOT NULL,
	"brand" text NOT NULL,
	"last4" text NOT NULL,
	"status" text NOT NULL,
	"provider" text DEFAULT 'simulated' NOT NULL,
	"provider_ref" text DEFAULT '' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_codes" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"tries" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" integer PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"guide_subscription_price" numeric NOT NULL,
	"subscription_days" integer NOT NULL,
	"promotion_price" numeric NOT NULL,
	"promotion_days" integer NOT NULL,
	"iqd_per_usd" integer NOT NULL,
	"seeded_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" integer PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"reporter_id" integer NOT NULL,
	"against_id" integer NOT NULL,
	"reason" text NOT NULL,
	"details" text NOT NULL,
	"status" text NOT NULL,
	"resolution" text DEFAULT '' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"resolved_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" integer PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"subject_id" integer NOT NULL,
	"author_role" text NOT NULL,
	"overall" numeric NOT NULL,
	"ratings" jsonb NOT NULL,
	"hire_again" boolean NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_cards" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"last4" text NOT NULL,
	"name" text NOT NULL,
	"expiry" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_events" (
	"id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_ar" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"description_ar" text DEFAULT '' NOT NULL,
	"city" text NOT NULL,
	"venue" text DEFAULT '' NOT NULL,
	"venue_ar" text DEFAULT '' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"img" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" integer PRIMARY KEY NOT NULL,
	"tourist_id" integer NOT NULL,
	"guide_id" integer NOT NULL,
	"request_id" integer,
	"created_at" timestamp (3) with time zone NOT NULL,
	"last_at" timestamp (3) with time zone NOT NULL,
	"read_at" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_requests" (
	"id" integer PRIMARY KEY NOT NULL,
	"tourist_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cities" text[] NOT NULL,
	"places" integer[] NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"group_size" integer NOT NULL,
	"languages" text[] NOT NULL,
	"interests" text[] NOT NULL,
	"budget_min" numeric NOT NULL,
	"budget_max" numeric NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"female_guide" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"direct_guide_id" integer,
	"plan" jsonb NOT NULL,
	"cover" text,
	"invited" integer[] NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"key" text PRIMARY KEY NOT NULL,
	"owner_id" integer,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"password_hash" text NOT NULL,
	"country" text NOT NULL,
	"gender" text NOT NULL,
	"avatar_color" integer NOT NULL,
	"avatar" text,
	"cover" text,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"payment_verified" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_photos" (
	"guide_id" integer PRIMARY KEY NOT NULL,
	"id_front" text NOT NULL,
	"id_back" text NOT NULL,
	"residence" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" integer PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"booking_id" integer,
	"milestone_id" integer,
	"amount" numeric NOT NULL,
	"fee" numeric DEFAULT 0 NOT NULL,
	"at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" integer PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric NOT NULL,
	"brand" text NOT NULL,
	"last4" text NOT NULL,
	"provider_ref" text DEFAULT '' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_request_id_trip_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."trip_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tourist_id_users_id_fk" FOREIGN KEY ("tourist_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guide_id_users_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_photos" ADD CONSTRAINT "guide_photos_guide_id_guide_profiles_user_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guide_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD CONSTRAINT "guide_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_request_id_trip_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."trip_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_guide_id_users_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_pages" ADD CONSTRAINT "passport_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_codes" ADD CONSTRAINT "phone_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_city_cities_slug_fk" FOREIGN KEY ("city") REFERENCES "public"."cities"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_against_id_users_id_fk" FOREIGN KEY ("against_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_cards" ADD CONSTRAINT "saved_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_tourist_id_users_id_fk" FOREIGN KEY ("tourist_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_guide_id_users_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_requests" ADD CONSTRAINT "trip_requests_tourist_id_users_id_fk" FOREIGN KEY ("tourist_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_photos" ADD CONSTRAINT "verification_photos_guide_id_guide_profiles_user_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guide_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "bookings_tourist_idx" ON "bookings" USING btree ("tourist_id");--> statement-breakpoint
CREATE INDEX "bookings_guide_idx" ON "bookings" USING btree ("guide_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status","confirm_by");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "milestones_booking_idx" ON "milestones" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "offers_request_idx" ON "offers" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "offers_guide_idx" ON "offers" USING btree ("guide_id");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_booking_author_key" ON "reviews" USING btree ("booking_id","author_id");--> statement-breakpoint
CREATE INDEX "reviews_subject_idx" ON "reviews" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "threads_tourist_idx" ON "threads" USING btree ("tourist_id");--> statement-breakpoint
CREATE INDEX "threads_guide_idx" ON "threads" USING btree ("guide_id");--> statement-breakpoint
CREATE INDEX "trip_requests_tourist_idx" ON "trip_requests" USING btree ("tourist_id");--> statement-breakpoint
CREATE INDEX "trip_requests_status_idx" ON "trip_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email") WHERE "email" <> '';--> statement-breakpoint
CREATE INDEX "wallet_tx_user_idx" ON "wallet_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "withdrawals_user_idx" ON "withdrawals" USING btree ("user_id");