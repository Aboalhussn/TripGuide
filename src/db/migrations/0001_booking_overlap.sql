-- A guide can never be booked twice on the same day: the rules already prevent it,
-- this makes it impossible even when two requests race.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guide_no_overlap"
  EXCLUDE USING gist ("guide_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&)
  WHERE ("status" IN ('awaiting_guide', 'confirmed', 'disputed'));
