\set ON_ERROR_STOP on
-- Disposable fault and clock controls for the owned H1 fixture database only.
-- The root runs this text as fixture_admin and replaces __H1_FAULT__ and __H1_ORDER__ with validated values.
-- enroll and sweep call the actual native functions. They install no schedule.
-- The overlay trigger is test-only DDL. It is never part of a product migration, and the root
-- confirms through the observer catalog digest that it is removed.
\set fault '__H1_FAULT__'
\set target '__H1_ORDER__'
select :'fault'='enroll' as is_enroll, :'fault'='sweep' as is_sweep,
 :'fault'='nth-fact-install' as is_install, :'fault'='nth-fact-remove' as is_remove,
 :'fault'='downstream-claim' as is_claim, :'fault'='downstream-probe' as is_probe,
 :'fault'='downstream-drop' as is_drop \gset
do $$ begin
 assert session_user='fixture_admin' and current_database()='fixture','H1_FAULT_SESSION';
end $$;
\if :is_enroll
-- The actual enrollment and queue refresh. A review hold becomes HELD and is not claimable.
select 'H1_FAULT '||jsonb_build_object('enrolled',wallet_private.enroll_web_payment_reconciliation_candidates(500),
 'refreshed',wallet_private.refresh_web_payment_reconciliation_queue(500))::text;
\elif :is_sweep
-- The actual sweeper. It abandons only a cycle whose database deadline has passed.
select 'H1_FAULT '||jsonb_build_object('swept',wallet_private.sweep_web_payment_read_cycles(500),
 'dbNow',clock_timestamp()::text)::text;
\elif :is_install
begin;
create sequence public.h1_overlay_raised;
grant usage on sequence public.h1_overlay_raised to public;
-- Raises on the 33rd fact insert of one transaction for the target order. The sequence records the
-- raise outside the rolled back transaction.
create function public.h1_overlay_nth_fact() returns trigger language plpgsql set search_path='' as $overlay$
declare n integer;
begin
 if new.evidence->>'order_id'='__H1_ORDER__' then
  n:=coalesce(nullif(pg_catalog.current_setting('h1.fact_count',true),'')::integer,0)+1;
  perform pg_catalog.set_config('h1.fact_count',n::text,true);
  if n=33 then
   perform pg_catalog.nextval('public.h1_overlay_raised'::regclass);
   raise exception 'H1_OVERLAY_NTH_FACT';
  end if;
 end if;
 return new;
end $overlay$;
create trigger h1_overlay_nth_fact before insert on public.web_payment_observations
 for each row execute function public.h1_overlay_nth_fact();
commit;
select 'H1_FAULT '||jsonb_build_object('installed',exists(select 1 from pg_catalog.pg_trigger
 where tgname='h1_overlay_nth_fact' and tgrelid='public.web_payment_observations'::regclass),'target',:'target')::text;
\elif :is_remove
begin;
select 'H1_FAULT '||jsonb_build_object('raised',case when is_called then last_value else 0 end,'target',:'target')::text
 from public.h1_overlay_raised;
drop trigger h1_overlay_nth_fact on public.web_payment_observations;
drop function public.h1_overlay_nth_fact();
drop sequence public.h1_overlay_raised;
commit;
select 'H1_FAULT '||jsonb_build_object('removed',not exists(select 1 from pg_catalog.pg_trigger where tgname='h1_overlay_nth_fact')
 and not exists(select 1 from pg_catalog.pg_proc where proname='h1_overlay_nth_fact')
 and to_regclass('public.h1_overlay_raised') is null)::text;
\elif :is_claim
-- Downstream containment probe, part 1. A real v2 verification lease is taken through the actual
-- service_role command while the order has an intake and no read cycle. The raw lease stays in this
-- disposable table, which only fixture_admin can read. The output holds no lease token and no payload.
create table if not exists public.h1_downstream(order_id uuid primary key,inbox_id uuid not null,lease jsonb,
 claimed_at timestamptz,report jsonb);
revoke all on public.h1_downstream from public;
do $probe$ declare v_order uuid:='__H1_ORDER__';v_inbox uuid;r jsonb;v_listed boolean;v_open integer;v_due boolean;
begin
 select inbox_id into strict v_inbox from public.web_payment_purchase_intakes where order_id=v_order;
 select count(*) into v_open from public.web_payment_read_cycles where order_id=v_order;
 select status='PENDING' and attempt_count=0 and lease_token is null and next_retry_at<=clock_timestamp() into strict v_due
  from public.wallet_provider_event_inbox where id=v_inbox;
 set local role service_role;
 v_listed:=exists(select 1 from public.list_web_purchase_verification_candidates(100) c where c.inbox_id=v_inbox);
 r:=public.claim_web_payment_purchase_v2(v_inbox,gen_random_uuid(),300);
 reset role;
 insert into public.h1_downstream(order_id,inbox_id,lease,claimed_at,report) values(v_order,v_inbox,r,clock_timestamp(),
  jsonb_build_object('openCycles',v_open,'inboxDue',v_due,'listedBeforeClaim',v_listed,'claimOutcome',r->>'outcome',
   'contractVersion',r->>'contract_version','leaseSeconds',300));
exception when others or assert_failure then reset role;raise;
end $probe$;
select 'H1_FAULT '||report::text from public.h1_downstream where order_id=:'target'::uuid;
\elif :is_probe
-- Downstream containment probe, part 2, after the actual sweep. It calls the actual list, claim and prepare
-- commands as service_role with the existing worker RETRY envelope, and counts rows before and after.
-- It creates no verified result, no FULL proof and no grant. PayPal COMPLETE stays closed.
create table if not exists public.h1_downstream(order_id uuid primary key,inbox_id uuid not null,lease jsonb,
 claimed_at timestamptz,report jsonb);
revoke all on public.h1_downstream from public;
create function pg_temp.h1_counters(p_order uuid,p_inbox uuid) returns jsonb language sql as $counters$
 select jsonb_build_object(
  'intakes',(select count(*) from public.web_payment_purchase_intakes where order_id=p_order),
  'verificationResults',(select count(*) from public.web_payment_verification_results where order_id=p_order),
  'reviewResults',(select count(*) from public.web_payment_verification_results where order_id=p_order and decision='REVIEW'),
  'reviewSeals',(select count(*) from public.web_payment_verification_seals where order_id=p_order and record_kind='REVIEW'),
  'settlements',(select count(*) from public.web_payment_settlements where order_id=p_order),
  'settlementLeases',(select count(*) from public.web_payment_settlement_leases where order_id=p_order),
  'inbox',(select jsonb_build_object('status',status,'attemptCount',attempt_count,'rowVersion',row_version::text,
    'leased',lease_token is not null) from public.wallet_provider_event_inbox where id=p_inbox))
$counters$;
do $probe$ declare v_order uuid:='__H1_ORDER__';v_inbox uuid;d public.h1_downstream%rowtype;b jsonb;v jsonb;r jsonb;
 at_time timestamptz;v_listed boolean;v_claim jsonb;v_prepare jsonb;v_slisted boolean;v_sclaim jsonb;
 before_s jsonb;after_s jsonb;pre jsonb;v_report jsonb;
begin
 select inbox_id into strict v_inbox from public.web_payment_purchase_intakes where order_id=v_order;
 select * into d from public.h1_downstream where order_id=v_order;
 select jsonb_build_object('status',status,'attemptCount',attempt_count,'leased',lease_token is not null,
  'due',next_retry_at<=clock_timestamp()) into strict pre from public.wallet_provider_event_inbox where id=v_inbox;
 before_s:=pg_temp.h1_counters(v_order,v_inbox);
 set local role service_role;
 v_listed:=exists(select 1 from public.list_web_purchase_verification_candidates(100) c where c.inbox_id=v_inbox);
 if d.lease is null then
  -- Due and unleased: the claim result is attributable to the hold, not to an active lease.
  v_claim:=public.claim_web_payment_purchase_v2(v_inbox,gen_random_uuid(),300);
 else
  -- The existing valid worker RETRY envelope of the native fixture, with the live lease.
  b:=public.get_web_payment_verification_context(v_inbox);at_time:=clock_timestamp();
  v:=jsonb_build_object('contract_version','web-purchase-verification.v1','decision','RETRY','reason_code','PROVIDER_NETWORK_TEMPORARY',
   'selection',jsonb_build_object('provider',b->'provider','environment',b->'environment','credential_ref',b->'credential_ref',
    'binding_version',b->'binding_version','binding_hash',b->'binding_hash','expected_application',b->'expected_application',
    'expected_scope',b->'expected_scope'),
   'evidence',null,'provider_status',null,'completed_at',null,'completion_source',null,'response_hashes','[]'::jsonb,
   'observed_at',at_time,'verified_at',at_time);
  r:=public.prepare_web_purchase_verification_result(v_inbox,(d.lease->>'lease_token')::uuid,(d.lease->>'inbox_row_version')::bigint,v);
  v_prepare:=jsonb_build_object('decision',r#>>'{result,decision}','reasonCode',r#>>'{result,reason_code}',
   'retryDelaySeconds',r#>>'{transport,retry_delay_seconds}');
 end if;
 v_slisted:=exists(select 1 from public.list_web_payment_settlement_candidates(100) c where c.inbox_id=v_inbox);
 v_sclaim:=public.claim_web_payment_settlement(v_inbox,gen_random_uuid(),300);
 reset role;
 after_s:=pg_temp.h1_counters(v_order,v_inbox);
 v_report:=jsonb_build_object('precondition',pre,'verificationListed',v_listed,'claim',v_claim-'lease_token',
  'prepare',v_prepare,
  -- The actual inbox lease of the v2 claim, read after the probe: still PROCESSING and not expired.
  'leaseLive',case when d.lease is null then null else (select i.status='PROCESSING' and i.lease_until>clock_timestamp()
    and i.lease_token=(d.lease->>'lease_token')::uuid from public.wallet_provider_event_inbox i where i.id=v_inbox) end,
  'leaseAttributionAmbiguous',d.lease is not null,'settlementListed',v_slisted,'settlementClaim',v_sclaim-'lease_token',
  'settlementUnmetPrecondition','No verified result exists and PayPal COMPLETE is closed. NOT_CLAIMABLE is not attributed to the hold alone.',
  'before',before_s,'after',after_s,'dbNow',clock_timestamp()::text);
 insert into public.h1_downstream(order_id,inbox_id,lease,claimed_at,report) values(v_order,v_inbox,null,null,v_report)
  on conflict(order_id) do update set report=excluded.report;
exception when others or assert_failure then reset role;raise;
end $probe$;
select 'H1_FAULT '||report::text from public.h1_downstream where order_id=:'target'::uuid;
\elif :is_drop
drop table if exists public.h1_downstream;
select 'H1_FAULT '||jsonb_build_object('removed',to_regclass('public.h1_downstream') is null)::text;
\else
select 'H1_FAULT_INVALID' from (select 1/0) fail;
\endif
select 'H1_FAULT_COMPLETE:'||:'fault';
