CREATE TABLE "tracked_trades" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"direction" text NOT NULL,
	"entry" double precision NOT NULL,
	"stop_loss" double precision NOT NULL,
	"target_1" double precision NOT NULL,
	"target_2" double precision NOT NULL,
	"leverage" double precision NOT NULL,
	"balance" double precision NOT NULL,
	"entry_time" bigint NOT NULL,
	"fill_time" bigint,
	"close_time" bigint,
	"status" text NOT NULL,
	"current_price" double precision,
	"history" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracked_trades" ADD CONSTRAINT "tracked_trades_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE cascade ON UPDATE no action;