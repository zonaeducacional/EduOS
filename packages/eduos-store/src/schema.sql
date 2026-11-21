CREATE TABLE trusted_keys (
  id BLOB PRIMARY KEY NOT NULL CHECK (length(id) = 32),
  public_key BLOB NOT NULL CHECK (length(public_key) = 32)
) STRICT;

CREATE TABLE apps (
  id TEXT PRIMARY KEY NOT NULL,
  active_package BLOB NOT NULL,
  active_metadata TEXT NOT NULL,
  previous_package BLOB,
  previous_metadata TEXT,
  CHECK ((previous_package IS NULL) = (previous_metadata IS NULL))
) STRICT;

PRAGMA user_version = 1;
