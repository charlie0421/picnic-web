\set ON_ERROR_STOP on
-- Independent observer. The root runs this text on its own psql connection as fixture_admin.
-- It reads counts, kinds, versions, row identities and hashes. It selects no token, no credential,
-- no payload and no personal data. The root replaces __H1_MODE__ and __H1_ORDER__ with validated values.
\set mode '__H1_MODE__'
\set target '__H1_ORDER__'
select :'mode'='contract' as is_contract, :'mode'='order' as is_order, :'mode'='catalog' as is_catalog \gset
begin transaction isolation level read committed read only;
\if :is_contract
-- Installed-contract check. current10 without M1-M5 lacks every name below.
with wanted(kind,name) as (values
  ('function','record_web_payment_submission_result'),('function','open_web_payment_read_cycle'),
  ('function','complete_web_payment_read_cycle'),('function','record_web_payment_preintent_assertions'),
  ('function','claim_web_payment_reconciliation_item'),('function','finish_web_payment_reconciliation_item'),
  ('function','record_web_payment_reconciliation_run'),('function','release_web_payment_absence_hold'),
  ('table','web_payment_submission_classifications'),('table','web_payment_classification_conflicts'),
  ('table','web_payment_classification_assertions'),('table','web_payment_read_cycles'),
  ('table','web_payment_read_cycle_outcomes'),('table','web_payment_read_cycle_late_results'),
  ('table','web_payment_read_cycle_conflicts'),('table','web_payment_hold_resolutions'),
  ('table','web_payment_reconciliation_queue')),
missing as (
  select w.kind||':public.'||w.name as item from wanted w where
   (w.kind='function' and not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=w.name))
   or (w.kind='table' and to_regclass('public.'||w.name) is null))
select 'H1_OBSERVATION '||jsonb_build_object('mode','contract','sessionUser',session_user,'backendPid',pg_backend_pid(),
 'dbNow',clock_timestamp()::text,'serverVersionNum',current_setting('server_version_num'),
 'missing',coalesce((select jsonb_agg(item order by item) from missing),'[]'::jsonb),
 'installedContract',case when exists(select 1 from missing) then 'MISSING_CONTRACT' else 'current10+M1-M5' end)::text;
\elif :is_catalog
select 'H1_OBSERVATION '||jsonb_build_object('mode','catalog','sessionUser',session_user,'backendPid',pg_backend_pid(),
 'dbNow',clock_timestamp()::text,
 'triggerDigest',encode(extensions.digest(convert_to(coalesce((select jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,
    t.tgfoid::regprocedure::text,t.tgtype) order by t.tgname) from pg_catalog.pg_trigger t
   where t.tgrelid='public.web_payment_observations'::regclass and not t.tgisinternal),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex'),
 'overlayObjects',(select count(*) from pg_catalog.pg_proc where proname='h1_overlay_nth_fact')
   +(select count(*) from pg_catalog.pg_class where relname in ('h1_overlay_raised','h1_downstream')))::text;
\elif :is_order
with o as (select * from public.web_payment_orders where id=:'target'::uuid),
 c as (select pc.id from public.web_payment_provider_contexts pc where pc.order_id=:'target'::uuid),
 now_value as (select clock_timestamp() as at)
select 'H1_OBSERVATION '||jsonb_build_object('mode','order','sessionUser',session_user,'backendPid',pg_backend_pid(),
 'order',:'target','dbNow',(select at::text from now_value),'txSnapshot',txid_current_snapshot()::text,
 'postgrestBackendPids',coalesce((select jsonb_agg(a.pid order by a.pid) from pg_catalog.pg_stat_activity a where a.usename='authenticator'),'[]'::jsonb),
 'found',exists(select 1 from o),
 'paymentState',(select payment_state from o),'settlementState',(select settlement_state from o),
 'rowVersion',(select row_version::text from o),
 'grantCount',(select count(*) from o where settlement_state='GRANTED'),
 'attempts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'intentAt',a.submission_intent_at::text,
    'fencingVersion',a.fencing_version::text) order by a.id) from public.web_payment_charge_attempts a where a.order_id=:'target'::uuid),'[]'::jsonb),
 'classifications',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'attemptId',s.attempt_id,'requestedKind',s.requested_kind,
    'requestedCategory',s.requested_category,'effectiveKind',s.effective_kind,'effectiveCategory',s.effective_category,
    'dbAdverse',s.db_adverse,'requestHash',s.request_hash,'httpStatus',s.http_status,'bodyStatus',s.body_status,
    'postCaptureIds',to_jsonb(s.post_capture_ids),'factCount',cardinality(s.fact_observation_ids),
    'distinctFactCount',(select count(distinct f.id) from unnest(s.fact_observation_ids) fact(id)
       join public.web_payment_observations f on f.id=fact.id),
    'assertionCount',cardinality(s.assertion_ids),'receiveFactIndex',s.receive_fact_index,'recordedAt',s.recorded_at::text)
    order by s.recorded_at,s.id) from public.web_payment_submission_classifications s where s.order_id=:'target'::uuid),'[]'::jsonb),
 'classificationConflicts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'conflictingRequestHash',s.conflicting_request_hash,
    'validationError',s.validation_error) order by s.recorded_at,s.id)
    from public.web_payment_classification_conflicts s where s.order_id=:'target'::uuid),'[]'::jsonb),
 'assertions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'origin',s.origin,'originId',s.origin_id,'reporter',s.reporter,
    'code',s.code,'detailHash',s.detail_hash) order by s.recorded_at,s.id)
    from public.web_payment_classification_assertions s where s.order_id=:'target'::uuid),'[]'::jsonb),
 'cycles',coalesce((select jsonb_agg(jsonb_build_object('id',rc.id,'generation',rc.generation::text,'actorKind',rc.actor_kind,
    'classificationIdAtOpen',rc.classification_id_at_open,'tokenHash',rc.cycle_token_hash,'openedAt',rc.opened_at::text,
    'deadlineAt',rc.deadline_at::text,'expired',rc.deadline_at<=(select at from now_value),
    'outcome',(select jsonb_build_object('kind',ro.kind,'completer',ro.completer,'requestedKind',ro.requested_kind,
       'requestHash',ro.request_hash,'getHttpStatus',ro.get_http_status,'getBodyStatus',ro.get_body_status,
       'observedCaptureIds',to_jsonb(ro.observed_capture_ids),'factCount',cardinality(ro.fact_observation_ids),
       'assertionCount',cardinality(ro.assertion_ids),'receiveFactIndex',ro.receive_fact_index,'recordedAt',ro.recorded_at::text)
       from public.web_payment_read_cycle_outcomes ro where ro.cycle_id=rc.id)) order by rc.generation)
    from public.web_payment_read_cycles rc where rc.order_id=:'target'::uuid),'[]'::jsonb),
 'lateResults',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'cycleId',s.cycle_id,'effectiveKind',s.effective_kind,
    'requestedKind',s.requested_kind,'requestHash',s.request_hash,'validationError',s.validation_error,
    'factCount',cardinality(s.fact_observation_ids)) order by s.recorded_at,s.id)
    from public.web_payment_read_cycle_late_results s where s.order_id=:'target'::uuid),'[]'::jsonb),
 'cycleConflicts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'cycleId',s.cycle_id,
    'conflictingRequestHash',s.conflicting_request_hash,'validationError',s.validation_error) order by s.recorded_at,s.id)
    from public.web_payment_read_cycle_conflicts s where s.order_id=:'target'::uuid),'[]'::jsonb),
 'links',coalesce((select jsonb_agg(jsonb_build_object('identityKind',l.identity_kind,'externalId',l.external_id)
    order by l.identity_kind,l.external_id) from public.web_payment_provider_links l where l.context_id in (select id from c)),'[]'::jsonb),
 'observationCount',(select count(*) from public.web_payment_observations s where s.evidence->>'order_id'=:'target'),
 'intakeCount',(select count(*) from public.web_payment_purchase_intakes x where x.order_id=:'target'::uuid),
 'inboxCount',(select count(*) from public.wallet_provider_event_inbox i where i.idempotency_key='web-payment.purchase.v2:'||:'target'),
 'receiptCount',(select count(*) from public.receipts r where r.verification_data::jsonb->>'order_id'=:'target'),
 'queue',(select jsonb_build_object('queueState',q.queue_state,'attempt',q.attempt,'lastResultCode',q.last_result_code,
    'leased',q.lease_token is not null,'nextDueAt',q.next_due_at::text,'rowVersion',q.row_version::text)
    from public.web_payment_reconciliation_queue q where q.order_id=:'target'::uuid),
 'hold',wallet_private.web_payment_intake_hold(:'target'::uuid,(select at from now_value)))::text;
\else
select 'H1_OBSERVER_MODE_INVALID' from (select 1/0) fail;
\endif
rollback;
select 'H1_OBSERVER_COMPLETE';
