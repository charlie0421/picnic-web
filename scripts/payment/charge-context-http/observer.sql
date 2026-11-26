\set ON_ERROR_STOP on
-- Coordinator-only full observation; no DDL or persistent observation writes.
begin;
set local time zone 'UTC';
do $$
declare relation_name text;role_name text;identity text;rpc regprocedure;
 state jsonb:='{}';counts jsonb:='{}';full_counts jsonb:='{}';rows jsonb;n bigint;
 item jsonb;native jsonb:='{}';envelope jsonb;value jsonb;failure_state text;failure_message text;
 cases jsonb:=current_setting('charge_context.cases')::jsonb;
 financial text[]:=array['receipts','star_candy_history','star_candy_bonus_history',
 'wallet_financial_operations','wallet_credit_operations','wallet_credit_allocations',
 'wallet_debit_operations','wallet_debit_allocations','wallet_debit_bucket_allocations','wallet_repair_operations',
 'wallet_recovery_debts','wallet_recovery_debt_events','wallet_provider_event_inbox','wallet_provider_verification_attestations',
 'purchase_reward_snapshots','purchase_reward_allocations','purchase_promotion_resolutions','purchase_promotion_resolution_events',
 'purchase_promotion_awards','purchase_promotion_resolution_inputs','wallet_promotion_time_attestations',
 'purchase_refund_events','purchase_refund_allocations','cotton_candy_grants','cotton_candy_ledger',
 'wallet_star_lots','wallet_star_spend_allocations','wallet_star_lot_retirements','wallet_star_lot_applications',
 'wallet_star_lot_violations','wallet_bonus_projection_violations'];
begin
 assert session_user='fixture_admin' and current_user='fixture_admin','OBSERVER_ADMIN_REQUIRED';
 assert current_database()='fixture' and current_setting('plpgsql.check_asserts')='on';
 assert cardinality(financial)=31;
 foreach relation_name in array financial loop
  assert to_regclass('public.'||relation_name) is not null,'FINANCIAL_RELATION_MISSING: '||relation_name;
  execute format('select count(*) from public.%I',relation_name) into n;
  assert n=0,'FINANCIAL_ROWS_PRESENT: '||relation_name;
  counts:=counts||jsonb_build_object(relation_name,n);
 end loop;
 foreach relation_name in array array['web_payment_verification_seals','web_payment_verification_results',
  'web_payment_settlement_leases','web_payment_settlement_outcomes','web_payment_full_verification_proofs','web_payment_settlements'] loop
  assert to_regclass('public.'||relation_name) is not null,'FULL_RELATION_MISSING: '||relation_name;
  execute format('select count(*) from public.%I',relation_name) into n;
  assert n=0,'FULL_ROWS_PRESENT: '||relation_name;
  full_counts:=full_counts||jsonb_build_object(relation_name,n);
 end loop;
 foreach relation_name in array array['web_payment_orders','web_payment_quotes','web_payment_provider_contexts',
  'web_payment_provider_links','web_payment_observations','web_payment_charge_attempts','user_profiles',
  'web_payment_provider_settings','web_payment_verification_bindings','web_payment_purchase_intakes'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t',relation_name) into rows;
  state:=state||jsonb_build_object(relation_name,rows);
 end loop;
 rpc:='public.get_web_payment_charge_context(uuid,uuid)'::regprocedure;
 assert (select proowner='wallet_command_owner'::regrole and prosecdef and provolatile='s'
  and proconfig @> array['search_path=""'] from pg_proc where oid=rpc),'GETTER_IDENTITY_INVALID';
 assert has_function_privilege('service_role',rpc,'EXECUTE');
 assert not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid=rpc and a.grantee=0),'GETTER_PUBLIC_EXECUTE';
 foreach role_name in array array['anon','authenticated','wallet_test','wallet_state_owner','wallet_attestation_owner'] loop
  assert not has_function_privilege(role_name,rpc,'EXECUTE'),'GETTER_EFFECTIVE_EXECUTE: '||role_name;
 end loop;
 foreach identity in array array['wallet_private.web_payment_charge_review_exists(uuid,uuid)',
  'wallet_private.web_payment_charge_command(uuid,uuid,bigint,text,boolean,uuid,uuid,bigint)'] loop
  rpc:=identity::regprocedure;
  assert not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid=rpc and a.grantee=0 and a.privilege_type='EXECUTE'),'PRIVATE_PUBLIC_EXECUTE';
  foreach role_name in array array['anon','authenticated','service_role','wallet_test','wallet_state_owner','wallet_attestation_owner'] loop
   assert not has_function_privilege(role_name,rpc,'EXECUTE'),'PRIVATE_EFFECTIVE_EXECUTE: '||role_name||'/'||identity;
  end loop;
 end loop;
 foreach relation_name in array array['web_payment_orders','web_payment_quotes','web_payment_provider_contexts',
  'web_payment_charge_attempts','web_payment_provider_links','web_payment_observations','web_payment_verification_bindings'] loop
  assert not has_table_privilege('service_role','public.'||relation_name,'SELECT'),'SERVICE_TABLE_SELECT: '||relation_name;
  assert (select relrowsecurity from pg_class where oid=to_regclass('public.'||relation_name)),'SOURCE_RLS_DISABLED';
 end loop;
 foreach role_name in array array['wallet_command_owner','wallet_state_owner','wallet_attestation_owner'] loop
  assert not has_schema_privilege(role_name,'public','CREATE') and not has_schema_privilege(role_name,'wallet_private','CREATE'),
   'BORROWED_CREATE_SURVIVED: '||role_name;
 end loop;
 assert has_schema_privilege('postgres','public','CREATE') and not has_schema_privilege('postgres','wallet_private','CREATE');
 assert (select not rolsuper and not rolbypassrls from pg_roles where rolname='postgres');
 assert exists(select 1 from wallet_private.wallet_service_rpc_catalog c
  join wallet_private.wallet_service_rpc_manifest m using(function_identity)
  join wallet_private.wallet_relevant_service_rpc_identities() actual using(function_identity)
  where c.function_identity='get_web_payment_charge_context(uuid,uuid)' and c.function_name='get_web_payment_charge_context'
   and c.is_wallet_relevant and c.evidence='functiondef:wallet_relation' and actual.evidence=c.evidence
   and m.classification='PROVIDER_WORKER'),'GETTER_CATALOG_INVALID';
 perform wallet_private.assert_wallet_service_rpc_manifest();
 assert (select count(*)=0 from public.web_payment_orders where user_id='c755aa01-0000-4000-8000-000000000002');
 -- Role establishment is outside the catch that records native getter errors.
 for item in select * from jsonb_array_elements(cases) loop
  set local role service_role;
  assert current_user='service_role','OBSERVER_SERVICE_ROLE_NOT_ESTABLISHED';
  begin
   value:=public.get_web_payment_charge_context((item->>'actor')::uuid,(item->>'order')::uuid);
   envelope:=jsonb_build_object('ok',true,'value',value);
  exception when others then
   get stacked diagnostics failure_state=returned_sqlstate,failure_message=message_text;
   envelope:=jsonb_build_object('ok',false,'code',failure_state,'message',failure_message);
  end;
  reset role;
  assert current_user='fixture_admin','OBSERVER_ADMIN_NOT_RESTORED';
  native:=native||jsonb_build_object(item->>'label',envelope);
 end loop;
 perform set_config('charge_context.observation',jsonb_build_object('label',current_setting('charge_context.observation_label'),
  'sessionUser',session_user,'currentUser',current_user,'timezone',current_setting('TimeZone'),
  'state',state,'digest',encode(extensions.digest(convert_to(state::text,'UTF8'),'sha256'),'hex'),
  'financialCounts',counts,'fullCounts',full_counts,'financialZero',true,'fullZero',true,'aclValid',true,
  'native',native)::text,true);
end $$;
select 'CHARGE_CONTEXT_OBSERVATION '||current_setting('charge_context.observation');
rollback;
select 'CHARGE_CONTEXT_OBSERVER_COMPLETE';
