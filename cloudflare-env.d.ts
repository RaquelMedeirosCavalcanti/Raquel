declare namespace Cloudflare {
  interface Env {
    GARMIN_PERSONAL_API_KEY?: string;
    GARMIN_OWNER_EMAIL?: string;
    SITE_OWNER_EMAIL?: string;
    OWNER_USER_ID?: string;
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    DB?: D1Database;
    ASSETS?: Fetcher;
    BUCKET?: R2Bucket;
  }
}
