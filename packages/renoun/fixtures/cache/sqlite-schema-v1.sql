BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO meta(key, value)
VALUES ('cache_schema_version', '1');

CREATE TABLE IF NOT EXISTS cache_entries (
  node_key TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  value_blob BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cache_deps (
  node_key TEXT NOT NULL,
  dep_key TEXT NOT NULL,
  dep_version TEXT NOT NULL,
  PRIMARY KEY (node_key, dep_key)
);

CREATE TABLE IF NOT EXISTS cache_inflight (
  node_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

INSERT OR REPLACE INTO cache_entries(node_key, fingerprint, value_blob, updated_at)
VALUES
  ('test:legacy:warm-start', 'ad87109bfff0765f4dd8cf4943b04d16a4070fea', X'00', 1700000000000),
  ('test:legacy:deps', 'ccb0f54012afca040b809e779c0616059d6dab6c', X'00', 1700000000000);

INSERT OR REPLACE INTO cache_deps(node_key, dep_key, dep_version)
VALUES
  ('test:legacy:deps', 'file:/fixture/dep.ts', 'dep:v1');

COMMIT;
