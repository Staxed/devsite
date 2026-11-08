-- ActivityOS check (read-only): reports present/missing for every table, column and index
-- from migrations 013-015, plus the app_settings rows the settings loader requires.
-- Run in the Supabase SQL editor. Rows with present = false are what activityos-fix.sql adds.
with checks as (
  select 'table' as kind, 'github_deliveries' as name, to_regclass('public.github_deliveries') is not null as present
  union all
  select 'column', 'github_deliveries.delivery_id', exists (select 1 from information_schema.columns where table_schema='public' and table_name='github_deliveries' and column_name='delivery_id')
  union all
  select 'column', 'github_deliveries.event_name', exists (select 1 from information_schema.columns where table_schema='public' and table_name='github_deliveries' and column_name='event_name')
  union all
  select 'column', 'github_deliveries.payload', exists (select 1 from information_schema.columns where table_schema='public' and table_name='github_deliveries' and column_name='payload')
  union all
  select 'column', 'github_deliveries.status', exists (select 1 from information_schema.columns where table_schema='public' and table_name='github_deliveries' and column_name='status')
  union all
  select 'column', 'github_deliveries.error', exists (select 1 from information_schema.columns where table_schema='public' and table_name='github_deliveries' and column_name='error')
  union all
  select 'column', 'github_deliveries.received_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='github_deliveries' and column_name='received_at')
  union all
  select 'column', 'github_deliveries.processed_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='github_deliveries' and column_name='processed_at')
  union all
  select 'table' as kind, 'activity_events' as name, to_regclass('public.activity_events') is not null as present
  union all
  select 'column', 'activity_events.occurred_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='occurred_at')
  union all
  select 'column', 'activity_events.occurred_on', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='occurred_on')
  union all
  select 'column', 'activity_events.source', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='source')
  union all
  select 'column', 'activity_events.category', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='category')
  union all
  select 'column', 'activity_events.kind', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='kind')
  union all
  select 'column', 'activity_events.value', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='value')
  union all
  select 'column', 'activity_events.unit', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='unit')
  union all
  select 'column', 'activity_events.title', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='title')
  union all
  select 'column', 'activity_events.public_summary', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='public_summary')
  union all
  select 'column', 'activity_events.visibility', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='visibility')
  union all
  select 'column', 'activity_events.repo_visibility', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='repo_visibility')
  union all
  select 'column', 'activity_events.repo_hash', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='repo_hash')
  union all
  select 'column', 'activity_events.url', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='url')
  union all
  select 'column', 'activity_events.metadata', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='metadata')
  union all
  select 'column', 'activity_events.dedupe_key', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='dedupe_key')
  union all
  select 'column', 'activity_events.created_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='created_at')
  union all
  select 'column', 'activity_events.posted_to_discord', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='posted_to_discord')
  union all
  select 'table' as kind, 'habits' as name, to_regclass('public.habits') is not null as present
  union all
  select 'column', 'habits.name', exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='name')
  union all
  select 'column', 'habits.is_active', exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='is_active')
  union all
  select 'column', 'habits.visibility', exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='visibility')
  union all
  select 'column', 'habits.rule_type', exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='rule_type')
  union all
  select 'column', 'habits.target_value', exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='target_value')
  union all
  select 'column', 'habits.target_unit', exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='target_unit')
  union all
  select 'column', 'habits.window_days', exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='window_days')
  union all
  select 'column', 'habits.filters', exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='filters')
  union all
  select 'column', 'habits.created_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='created_at')
  union all
  select 'column', 'habits.updated_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='updated_at')
  union all
  select 'table' as kind, 'goals' as name, to_regclass('public.goals') is not null as present
  union all
  select 'column', 'goals.name', exists (select 1 from information_schema.columns where table_schema='public' and table_name='goals' and column_name='name')
  union all
  select 'column', 'goals.visibility', exists (select 1 from information_schema.columns where table_schema='public' and table_name='goals' and column_name='visibility')
  union all
  select 'column', 'goals.start_date', exists (select 1 from information_schema.columns where table_schema='public' and table_name='goals' and column_name='start_date')
  union all
  select 'column', 'goals.end_date', exists (select 1 from information_schema.columns where table_schema='public' and table_name='goals' and column_name='end_date')
  union all
  select 'column', 'goals.target_value', exists (select 1 from information_schema.columns where table_schema='public' and table_name='goals' and column_name='target_value')
  union all
  select 'column', 'goals.target_unit', exists (select 1 from information_schema.columns where table_schema='public' and table_name='goals' and column_name='target_unit')
  union all
  select 'column', 'goals.filters', exists (select 1 from information_schema.columns where table_schema='public' and table_name='goals' and column_name='filters')
  union all
  select 'column', 'goals.status', exists (select 1 from information_schema.columns where table_schema='public' and table_name='goals' and column_name='status')
  union all
  select 'column', 'goals.created_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='goals' and column_name='created_at')
  union all
  select 'column', 'goals.updated_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='goals' and column_name='updated_at')
  union all
  select 'table' as kind, 'tracked_repos' as name, to_regclass('public.tracked_repos') is not null as present
  union all
  select 'column', 'tracked_repos.provider_repo_id', exists (select 1 from information_schema.columns where table_schema='public' and table_name='tracked_repos' and column_name='provider_repo_id')
  union all
  select 'column', 'tracked_repos.owner', exists (select 1 from information_schema.columns where table_schema='public' and table_name='tracked_repos' and column_name='owner')
  union all
  select 'column', 'tracked_repos.name', exists (select 1 from information_schema.columns where table_schema='public' and table_name='tracked_repos' and column_name='name')
  union all
  select 'column', 'tracked_repos.visibility', exists (select 1 from information_schema.columns where table_schema='public' and table_name='tracked_repos' and column_name='visibility')
  union all
  select 'column', 'tracked_repos.is_enabled', exists (select 1 from information_schema.columns where table_schema='public' and table_name='tracked_repos' and column_name='is_enabled')
  union all
  select 'column', 'tracked_repos.created_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='tracked_repos' and column_name='created_at')
  union all
  select 'column', 'tracked_repos.updated_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='tracked_repos' and column_name='updated_at')
  union all
  select 'table' as kind, 'sync_state' as name, to_regclass('public.sync_state') is not null as present
  union all
  select 'column', 'sync_state.sync_type', exists (select 1 from information_schema.columns where table_schema='public' and table_name='sync_state' and column_name='sync_type')
  union all
  select 'column', 'sync_state.scope', exists (select 1 from information_schema.columns where table_schema='public' and table_name='sync_state' and column_name='scope')
  union all
  select 'column', 'sync_state.cursor', exists (select 1 from information_schema.columns where table_schema='public' and table_name='sync_state' and column_name='cursor')
  union all
  select 'column', 'sync_state.last_synced_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='sync_state' and column_name='last_synced_at')
  union all
  select 'table' as kind, 'sync_runs' as name, to_regclass('public.sync_runs') is not null as present
  union all
  select 'column', 'sync_runs.sync_type', exists (select 1 from information_schema.columns where table_schema='public' and table_name='sync_runs' and column_name='sync_type')
  union all
  select 'column', 'sync_runs.started_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='sync_runs' and column_name='started_at')
  union all
  select 'column', 'sync_runs.finished_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='sync_runs' and column_name='finished_at')
  union all
  select 'column', 'sync_runs.status', exists (select 1 from information_schema.columns where table_schema='public' and table_name='sync_runs' and column_name='status')
  union all
  select 'column', 'sync_runs.stats', exists (select 1 from information_schema.columns where table_schema='public' and table_name='sync_runs' and column_name='stats')
  union all
  select 'column', 'sync_runs.error', exists (select 1 from information_schema.columns where table_schema='public' and table_name='sync_runs' and column_name='error')
  union all
  select 'table' as kind, 'achievements' as name, to_regclass('public.achievements') is not null as present
  union all
  select 'column', 'achievements.achievement_id', exists (select 1 from information_schema.columns where table_schema='public' and table_name='achievements' and column_name='achievement_id')
  union all
  select 'column', 'achievements.name', exists (select 1 from information_schema.columns where table_schema='public' and table_name='achievements' and column_name='name')
  union all
  select 'column', 'achievements.emoji', exists (select 1 from information_schema.columns where table_schema='public' and table_name='achievements' and column_name='emoji')
  union all
  select 'column', 'achievements.description', exists (select 1 from information_schema.columns where table_schema='public' and table_name='achievements' and column_name='description')
  union all
  select 'column', 'achievements.earned_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='achievements' and column_name='earned_at')
  union all
  select 'column', 'achievements.period', exists (select 1 from information_schema.columns where table_schema='public' and table_name='achievements' and column_name='period')
  union all
  select 'column', 'achievements.metadata', exists (select 1 from information_schema.columns where table_schema='public' and table_name='achievements' and column_name='metadata')
  union all
  select 'column', 'achievements.created_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='achievements' and column_name='created_at')
  union all
  select 'table' as kind, 'discord_posts' as name, to_regclass('public.discord_posts') is not null as present
  union all
  select 'column', 'discord_posts.delivery_id', exists (select 1 from information_schema.columns where table_schema='public' and table_name='discord_posts' and column_name='delivery_id')
  union all
  select 'column', 'discord_posts.channel_id', exists (select 1 from information_schema.columns where table_schema='public' and table_name='discord_posts' and column_name='channel_id')
  union all
  select 'column', 'discord_posts.message_id', exists (select 1 from information_schema.columns where table_schema='public' and table_name='discord_posts' and column_name='message_id')
  union all
  select 'column', 'discord_posts.events_count', exists (select 1 from information_schema.columns where table_schema='public' and table_name='discord_posts' and column_name='events_count')
  union all
  select 'column', 'discord_posts.posted_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='discord_posts' and column_name='posted_at')
  union all
  select 'table' as kind, 'summary_posts' as name, to_regclass('public.summary_posts') is not null as present
  union all
  select 'column', 'summary_posts.summary_type', exists (select 1 from information_schema.columns where table_schema='public' and table_name='summary_posts' and column_name='summary_type')
  union all
  select 'column', 'summary_posts.period', exists (select 1 from information_schema.columns where table_schema='public' and table_name='summary_posts' and column_name='period')
  union all
  select 'column', 'summary_posts.channel_id', exists (select 1 from information_schema.columns where table_schema='public' and table_name='summary_posts' and column_name='channel_id')
  union all
  select 'column', 'summary_posts.message_id', exists (select 1 from information_schema.columns where table_schema='public' and table_name='summary_posts' and column_name='message_id')
  union all
  select 'column', 'summary_posts.events_count', exists (select 1 from information_schema.columns where table_schema='public' and table_name='summary_posts' and column_name='events_count')
  union all
  select 'column', 'summary_posts.posted_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='summary_posts' and column_name='posted_at')
  union all
  select 'table' as kind, 'app_settings' as name, to_regclass('public.app_settings') is not null as present
  union all
  select 'column', 'app_settings.key', exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_settings' and column_name='key')
  union all
  select 'column', 'app_settings.value', exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_settings' and column_name='value')
  union all
  select 'column', 'app_settings.updated_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_settings' and column_name='updated_at')
  union all
  select 'table' as kind, 'quotes' as name, to_regclass('public.quotes') is not null as present
  union all
  select 'column', 'quotes.text', exists (select 1 from information_schema.columns where table_schema='public' and table_name='quotes' and column_name='text')
  union all
  select 'column', 'quotes.author', exists (select 1 from information_schema.columns where table_schema='public' and table_name='quotes' and column_name='author')
  union all
  select 'column', 'quotes.is_active', exists (select 1 from information_schema.columns where table_schema='public' and table_name='quotes' and column_name='is_active')
  union all
  select 'column', 'quotes.created_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='quotes' and column_name='created_at')
  union all
  select 'table' as kind, 'discord_repos' as name, to_regclass('public.discord_repos') is not null as present
  union all
  select 'column', 'discord_repos.repo_full_name', exists (select 1 from information_schema.columns where table_schema='public' and table_name='discord_repos' and column_name='repo_full_name')
  union all
  select 'column', 'discord_repos.display_name', exists (select 1 from information_schema.columns where table_schema='public' and table_name='discord_repos' and column_name='display_name')
  union all
  select 'column', 'discord_repos.included', exists (select 1 from information_schema.columns where table_schema='public' and table_name='discord_repos' and column_name='included')
  union all
  select 'column', 'discord_repos.created_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='discord_repos' and column_name='created_at')
  union all
  select 'column', 'discord_repos.updated_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='discord_repos' and column_name='updated_at')
  union all
  select 'column', 'activity_events.lines_added', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='lines_added')
  union all
  select 'column', 'activity_events.lines_removed', exists (select 1 from information_schema.columns where table_schema='public' and table_name='activity_events' and column_name='lines_removed')
  union all
  select 'index', 'idx_activity_events_occurred_on', to_regclass('public.idx_activity_events_occurred_on') is not null
  union all
  select 'index', 'idx_activity_events_kind', to_regclass('public.idx_activity_events_kind') is not null
  union all
  select 'index', 'idx_activity_events_source', to_regclass('public.idx_activity_events_source') is not null
  union all
  select 'index', 'idx_achievements_achievement_id', to_regclass('public.idx_achievements_achievement_id') is not null
  union all
  select 'index', 'idx_discord_posts_delivery_id', to_regclass('public.idx_discord_posts_delivery_id') is not null
  union all
  select 'index', 'idx_summary_posts_type_period', to_regclass('public.idx_summary_posts_type_period') is not null
  union all
  select 'index', 'idx_quotes_is_active', to_regclass('public.idx_quotes_is_active') is not null
  union all
  select 'index', 'idx_quotes_text_unique', to_regclass('public.idx_quotes_text_unique') is not null
  union all
  select 'index', 'idx_activity_events_unposted', to_regclass('public.idx_activity_events_unposted') is not null
  union all
  select 'setting', 'github_username', coalesce((xpath('/row/n/text()', query_to_xml(case when to_regclass('public.app_settings') is not null then 'select count(*) as n from public.app_settings where key = ''github_username''' else 'select 0 as n' end, false, true, '')))[1]::text::int, 0) > 0
  union all
  select 'setting', 'github_org', coalesce((xpath('/row/n/text()', query_to_xml(case when to_regclass('public.app_settings') is not null then 'select count(*) as n from public.app_settings where key = ''github_org''' else 'select 0 as n' end, false, true, '')))[1]::text::int, 0) > 0
  union all
  select 'setting', 'timezone', coalesce((xpath('/row/n/text()', query_to_xml(case when to_regclass('public.app_settings') is not null then 'select count(*) as n from public.app_settings where key = ''timezone''' else 'select 0 as n' end, false, true, '')))[1]::text::int, 0) > 0
  union all
  select 'setting', 'excluded_repos', coalesce((xpath('/row/n/text()', query_to_xml(case when to_regclass('public.app_settings') is not null then 'select count(*) as n from public.app_settings where key = ''excluded_repos''' else 'select 0 as n' end, false, true, '')))[1]::text::int, 0) > 0
)
select kind, name, case when present then 'present' else 'MISSING' end as status
from checks
order by present, kind, name;
