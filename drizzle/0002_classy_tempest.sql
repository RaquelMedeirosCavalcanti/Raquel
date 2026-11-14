CREATE TABLE `garmin_sync` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL
);
