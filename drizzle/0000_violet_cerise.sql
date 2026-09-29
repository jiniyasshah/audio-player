CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`duration` real NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tracks_owner_created` ON `tracks` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `idx_tracks_expires` ON `tracks` (`expires`);