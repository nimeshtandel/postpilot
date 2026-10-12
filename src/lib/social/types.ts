import type { Platform } from "../platforms";

/** A profile discovered during OAuth that will become a SocialAccount row. */
export interface ConnectedProfile {
  platform: Platform;
  externalId: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  meta?: Record<string, unknown>;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
}

export interface MediaItem {
  kind: "image" | "video";
  mimeType: string;
  size: number;
  /** Public https URL (platforms that pull media fetch this). */
  url: string;
  /** Object key in the R2 bucket (platforms that need bytes uploaded). */
  key: string;
}

export interface PublishInput {
  account: {
    externalId: string;
    accessToken: string;
    meta: Record<string, any>;
  };
  text: string;
  title?: string | null;
  media: MediaItem[];
}

export interface PublishResult {
  id: string;
  url?: string;
}

export interface ConnectAdapter {
  /** Whether this flow uses PKCE (we then store a verifier with the state). */
  pkce?: boolean;
  /** Env vars that must be set for this connection to work. */
  requiredEnv: string[];
  authUrl(state: string, codeChallenge?: string): string;
  callback(code: string, codeVerifier?: string): Promise<ConnectedProfile[]>;
}

export interface PublishAdapter {
  publish(input: PublishInput): Promise<PublishResult>;
  /** Refresh tokens. Return null if this account can't be refreshed. */
  refresh?(account: { accessToken: string; refreshToken?: string | null }): Promise<TokenSet | null>;
  /** Refresh when the token expires within this many ms. */
  refreshWindowMs?: number;
}
