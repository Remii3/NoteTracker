alter table public.study_goals
  add column weekly_topics_enabled boolean not null default true,
  add column review_reminders_enabled boolean not null default false,
  add column review_reminder_interval_days integer not null default 7,
  add column last_review_reminder_at timestamptz,
  add constraint study_goals_review_reminder_interval_days_check
    check (review_reminder_interval_days in (1, 2, 3, 7, 14, 30));

comment on column public.study_goals.weekly_topics_enabled is
  'Whether the weekly completed-topics goal is enabled.';
comment on column public.study_goals.review_reminders_enabled is
  'Whether in-app question review reminders are enabled.';
comment on column public.study_goals.review_reminder_interval_days is
  'Number of days between in-app question review reminders.';
comment on column public.study_goals.last_review_reminder_at is
  'When the most recent in-app question review reminder was displayed.';
