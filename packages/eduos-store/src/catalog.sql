CREATE TABLE catalog (
  id TEXT PRIMARY KEY NOT NULL,
  package BLOB NOT NULL,
  metadata TEXT NOT NULL
) STRICT;

PRAGMA user_version = 2;
