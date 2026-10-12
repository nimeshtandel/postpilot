// PostPilot data model (Drizzle ORM, SQLite / libSQL).
// Local dev: DATABASE_URL="file:./dev.db". Production: a Turso database URL + DATABASE_AUTH_TOKEN.
import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () => ts("created_at").notNull().default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  createdAt: createdAt(),
});

/** One connected profile: a Facebook Page, IG account, LinkedIn member, X user, Threads user, YouTube channel or TikTok user. */
export const socialAccounts = sqliteTable(
  "social_accounts",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // facebook | instagram | linkedin | x | threads | youtube | tiktok
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    username: text("username"),
    avatarUrl: text("avatar_url"),
    accessToken: text("access_token").notNull(), // AES-256-GCM encrypted
    refreshToken: text("refresh_token"), // AES-256-GCM encrypted
    tokenExpiresAt: ts("token_expires_at"),
    meta: text("meta"), // JSON: platform-specific extras
    status: text("status").notNull().default("active"), // active | expired
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  },
  (t) => [uniqueIndex("social_accounts_unique").on(t.userId, t.platform, t.externalId)],
);

export const media = sqliteTable("media", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  kind: text("kind").notNull(), // image | video
  createdAt: createdAt(),
});

export const posts = sqliteTable(
  "posts",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
    mediaIds: text("media_ids").notNull().default("[]"), // JSON array of media ids, in order
    title: text("title"), // YouTube title
    status: text("status").notNull().default("draft"), // draft | scheduled | publishing | published | partial | failed
    scheduledAt: ts("scheduled_at"),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  },
  (t) => [index("posts_due").on(t.status, t.scheduledAt), index("posts_user").on(t.userId)],
);

/** The post as it goes to one specific account. */
export const postTargets = sqliteTable(
  "post_targets",
  {
    id: id(),
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
    contentOverride: text("content_override"),
    status: text("status").notNull().default("pending"), // pending | published | failed
    externalPostId: text("external_post_id"),
    externalUrl: text("external_url"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    publishedAt: ts("published_at"),
  },
  (t) => [uniqueIndex("post_targets_unique").on(t.postId, t.accountId)],
);

/** Short-lived state for OAuth round-trips (CSRF state + PKCE verifier). */
export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  codeVerifier: text("code_verifier"),
  createdAt: createdAt(),
});

/** App-internal secrets generated on first use when not set as Worker secrets (see secrets.ts). */
export const appSecrets = sqliteTable("app_secrets", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
});

export const postsRelations = relations(posts, ({ many }) => ({ targets: many(postTargets) }));
export const postTargetsRelations = relations(postTargets, ({ one }) => ({
  post: one(posts, { fields: [postTargets.postId], references: [posts.id] }),
  account: one(socialAccounts, { fields: [postTargets.accountId], references: [socialAccounts.id] }),
}));
export const socialAccountsRelations = relations(socialAccounts, ({ many }) => ({ targets: many(postTargets) }));

export type SocialAccount =typeof socialAccounts.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostTarget = typeof postTargets.$inferSelect;
export type Media = typeof media.$inferSelect;
