CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_file_name_unique` ON `media` (`file_name`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`code_verifier` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `post_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`account_id` text NOT NULL,
	`content_override` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`external_post_id` text,
	`external_url` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_targets_unique` ON `post_targets` (`post_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`media_ids` text DEFAULT '[]' NOT NULL,
	`title` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_at` integer,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `posts_due` ON `posts` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `posts_user` ON `posts` (`user_id`);--> statement-breakpoint
CREATE TABLE `social_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`username` text,
	`avatar_url` text,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`token_expires_at` integer,
	`meta` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_accounts_unique` ON `social_accounts` (`user_id`,`platform`,`external_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`password_hash` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);