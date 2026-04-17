-- NewsEngine SaaS — Initial Schema
-- Forward-only migration (D1 has no down-migrations)
-- All timestamps are INTEGER (Unix epoch seconds)
-- All PKs are TEXT (UUIDs generated in application layer)

-- ============================================
-- Better Auth tables
-- ============================================

CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expiresAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  idToken TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- ============================================
-- Polar billing tables
-- ============================================

CREATE TABLE IF NOT EXISTS polar_customer (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL UNIQUE,
  polarCustomerId TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS polar_subscription (
  id TEXT PRIMARY KEY,
  polarCustomerId TEXT NOT NULL,
  productId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  currentPeriodEnd INTEGER,
  canceledAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (polarCustomerId) REFERENCES polar_customer(polarCustomerId) ON DELETE CASCADE
);

-- ============================================
-- App tables
-- ============================================

CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  articles_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  ran_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
  FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);
CREATE INDEX IF NOT EXISTS idx_session_token ON "session"(token);
CREATE INDEX IF NOT EXISTS idx_session_userId ON "session"(userId);
CREATE INDEX IF NOT EXISTS idx_account_userId ON "account"(userId);
CREATE INDEX IF NOT EXISTS idx_streams_user_id ON streams(user_id);
CREATE INDEX IF NOT EXISTS idx_streams_active ON streams(active) WHERE active = 1;
CREATE INDEX IF NOT EXISTS idx_streams_next_run ON streams(next_run_at) WHERE active = 1;
CREATE INDEX IF NOT EXISTS idx_run_history_stream ON run_history(stream_id, ran_at);
CREATE INDEX IF NOT EXISTS idx_run_history_user ON run_history(user_id, ran_at);
CREATE INDEX IF NOT EXISTS idx_polar_customer_userId ON polar_customer(userId);
CREATE INDEX IF NOT EXISTS idx_polar_sub_customerId ON polar_subscription(polarCustomerId);
