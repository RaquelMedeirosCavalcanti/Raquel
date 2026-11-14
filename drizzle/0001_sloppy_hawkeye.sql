CREATE TABLE `training_shares` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_shares_token_unique` ON `training_shares` (`token`);