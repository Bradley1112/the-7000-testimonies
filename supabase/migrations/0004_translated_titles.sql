-- The 7000 — store the original-language title alongside the English one.
--
-- Until now `testimonies.title` held whatever the source published. For
-- Indonesian-language sources that meant the summary was translated into
-- English while the headline above it stayed in Bahasa Indonesia — an obvious
-- defect in the first real test send.
--
-- From here, `title` always holds English (translated by the summariser when
-- the source is not English) and `original_title` preserves what the outlet
-- actually published. Keeping both matters for a project whose whole claim is
-- that a reader can check the summary against the source: the original title
-- is what they will see when they click through.

alter table testimonies
  add column original_title text;

comment on column testimonies.title is
  'Always English. Translated by the summariser when the source language is not
   English, so the headline and the summary never disagree in language.';

comment on column testimonies.original_title is
  'The headline as the outlet published it. Null when the source is already in
   English, i.e. when it would simply duplicate `title`. Shown in the archive
   so a reader clicking through recognises the piece they arrive at.';
