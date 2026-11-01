-- PostgreSQL's built-in default grants EXECUTE on new functions to PUBLIC.
-- A schema-scoped revoke cannot remove that global default, so revoke it for
-- postgres-created functions across schemas. Existing function grants remain
-- unchanged; migrations must grant intended execution explicitly.
alter default privileges for role postgres
  revoke execute on functions from public;
