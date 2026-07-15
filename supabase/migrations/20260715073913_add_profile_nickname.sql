-- Nickname: optional user-chosen name for greetings.
-- Table-level grants and existing row policies on profiles cover the new
-- column automatically; no policy or grant changes needed.

alter table public.profiles add column nickname text;
