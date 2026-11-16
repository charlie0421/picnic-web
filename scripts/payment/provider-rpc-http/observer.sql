\set ON_ERROR_STOP on
-- Root-only native observation. Every query runs inside a rollback-only,
-- read-only transaction; no product RPC or persistent observation is added.
begin read only;
set local time zone 'UTC';
do $$
declare relation_name text;role_name text;rpc regprocedure;
 product_state jsonb:='{}';control_state jsonb:='{}';counts jsonb:='{}';full_counts jsonb:='{}';
 rows jsonb;n bigint;item jsonb;native jsonb:='{}';value jsonb;keys text[];
 cases jsonb:=current_setting('provider_rpc.cases')::jsonb;
 financial text[]:=array['receipts','star_candy_history','star_candy_bonus_history',
 'wallet_financial_operations','wallet_credit_operations','wallet_credit_allocations',
 'wallet_debit_operations','wallet_debit_allocations','wallet_debit_bucket_allocations','wallet_repair_operations',
 'wallet_recovery_debts','wallet_recovery_debt_events','wallet_provider_event_inbox','wallet_provider_verification_attestations',
 'purchase_reward_snapshots','purchase_reward_allocations','purchase_promotion_resolutions','purchase_promotion_resolution_events',
 'purchase_promotion_awards','purchase_promotion_resolution_inputs','wallet_promotion_time_attestations',
 'purchase_refund_events','purchase_refund_allocations','cotton_candy_grants','cotton_candy_ledger',
 'wallet_star_lots','wallet_star_spend_allocations','wallet_star_lot_retirements','wallet_star_lot_applications',
 'wallet_star_lot_violations','wallet_bonus_projection_violations'];
 full_relations text[]:=array['web_payment_verification_seals','web_payment_verification_results',
 'web_payment_settlement_leases','web_payment_settlement_outcomes','web_payment_full_verification_proofs','web_payment_settlements'];
begin
 assert session_user='fixture_admin' and current_user='fixture_admin','OBSERVER_ADMIN_REQUIRED';
 assert current_database()='fixture' and current_setting('plpgsql.check_asserts')='on';
 assert current_setting('transaction_read_only')='on','OBSERVER_NATIVE_READONLY_REQUIRED';
 assert jsonb_array_length(cases)=9 and cardinality(financial)=31 and cardinality(full_relations)=6;
 foreach relation_name in array financial loop
  assert to_regclass('public.'||relation_name) is not null,'FINANCIAL_RELATION_MISSING: '||relation_name;
  execute format('select count(*) from public.%I',relation_name) into n;
  assert n=0,'FINANCIAL_ROWS_PRESENT: '||relation_name;
  counts:=counts||jsonb_build_object(relation_name,n);
 end loop;
 foreach relation_name in array full_relations loop
  assert to_regclass('public.'||relation_name) is not null,'FULL_RELATION_MISSING: '||relation_name;
  execute format('select count(*) from public.%I',relation_name) into n;
  assert n=0,'FULL_ROWS_PRESENT: '||relation_name;
  full_counts:=full_counts||jsonb_build_object(relation_name,n);
 end loop;
 foreach relation_name in array array['web_payment_orders','web_payment_quotes','web_payment_provider_contexts',
  'web_payment_provider_links','web_payment_observations','web_payment_charge_attempts','web_payment_purchase_intakes','products']
  ||financial||full_relations loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t',relation_name) into rows;
  product_state:=product_state||jsonb_build_object(relation_name,rows);
 end loop;
 foreach relation_name in array array['web_payment_provider_settings','web_payment_verification_bindings','user_profiles'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t',relation_name) into rows;
  control_state:=control_state||jsonb_build_object(relation_name,rows);
 end loop;
 rpc:='public.get_web_payment_provider_binding(uuid,uuid)'::regprocedure;
 assert (select proowner='wallet_command_owner'::regrole and prosecdef and provolatile='s'
  and prorettype='jsonb'::regtype and proargnames=array['p_actor_user_id','p_order_id']
  and proconfig @> array['search_path=""'] from pg_proc where oid=rpc),'GETTER_ABI_INVALID';
 assert has_function_privilege('service_role',rpc,'EXECUTE');
 assert not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid=rpc and a.grantee=0 and a.privilege_type='EXECUTE'),'GETTER_PUBLIC_EXECUTE';
 assert (select array_agg(distinct a.grantee order by a.grantee) from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid=rpc and a.privilege_type='EXECUTE' and a.grantee<>p.proowner)
  is not distinct from array['service_role'::regrole::oid],'GETTER_EXTRA_GRANTEE';
 foreach role_name in array array['anon','authenticated','wallet_test','wallet_state_owner','wallet_attestation_owner'] loop
  assert not has_function_privilege(role_name,rpc,'EXECUTE'),'GETTER_EFFECTIVE_EXECUTE: '||role_name;
 end loop;
 foreach relation_name in array array['web_payment_orders','web_payment_quotes','web_payment_provider_contexts','web_payment_verification_bindings'] loop
  assert not has_table_privilege('service_role','public.'||relation_name,'SELECT'),'SERVICE_TABLE_SELECT: '||relation_name;
  assert (select relrowsecurity from pg_class where oid=to_regclass('public.'||relation_name)),'SOURCE_RLS_DISABLED';
 end loop;
 foreach role_name in array array['wallet_command_owner','wallet_state_owner','wallet_attestation_owner'] loop
  assert not has_schema_privilege(role_name,'public','CREATE') and not has_schema_privilege(role_name,'wallet_private','CREATE'),
   'BORROWED_CREATE_SURVIVED: '||role_name;
 end loop;
 assert (select not rolsuper and not rolbypassrls from pg_roles where rolname='postgres');
 assert not has_schema_privilege('postgres','wallet_private','CREATE');
 assert exists(select 1 from wallet_private.wallet_service_rpc_catalog c
  join wallet_private.wallet_service_rpc_manifest m using(function_identity)
  join wallet_private.wallet_relevant_service_rpc_identities() r using(function_identity)
  where c.function_identity='get_web_payment_provider_binding(uuid,uuid)'
   and c.function_name='get_web_payment_provider_binding' and c.is_wallet_relevant
   and c.evidence=r.evidence and m.classification='PROVIDER_WORKER'),'GETTER_CATALOG_INVALID';
 perform wallet_private.assert_wallet_service_rpc_manifest();
 assert (select count(*)=0 from public.web_payment_orders where user_id='d155aa01-0000-4000-8000-000000000002');
 for item in select * from jsonb_array_elements(cases) loop
  set local role service_role;
  assert current_user='service_role','NATIVE_SERVICE_ROLE_NOT_ESTABLISHED';
  value:=public.get_web_payment_provider_binding((item->>'actor')::uuid,(item->>'order')::uuid);
  reset role;
  assert current_user='fixture_admin','OBSERVER_ADMIN_NOT_RESTORED';
  if item->>'label' like 'NF_%' then
   assert value='{"contract_version":"web-payment-provider-binding.v1","outcome":"NOT_FOUND","charge_authority":false}'::jsonb,
    'NATIVE_OWNER_FIRST_NOT_FOUND';
  elsif item->>'label'='B2' then
   assert value='{"contract_version":"web-payment-provider-binding.v1","outcome":"CONTEXT_REQUIRED","charge_authority":false}'::jsonb,
    'NATIVE_CONTEXT_REQUIRED';
  elsif item->>'label'='B3' then
   assert value='{"contract_version":"web-payment-provider-binding.v1","outcome":"VERIFICATION_BINDING_REQUIRED","charge_authority":false}'::jsonb,
    'NATIVE_BINDING_REQUIRED';
  else
   select array_agg(key order by key) into keys from jsonb_object_keys(value) key;
   assert keys=array['billing_country','binding_hash','binding_id','binding_version','charge_authority','context_id',
    'contract_version','credential_ref','environment','expected_application','order_id','outcome','provider','quote_hash','quote_id','scope'],
    'NATIVE_EXACT16_KEYS';
   assert value->>'contract_version'='web-payment-provider-binding.v1' and value->>'outcome'='FOUND'
    and value->'charge_authority'='false'::jsonb and value->>'order_id'=item->>'order'
    and value->'binding_version'='"1"'::jsonb,'NATIVE_FROZEN_FOUND';
   if item->>'label'='B1' then
    assert value->>'provider'='PAYPAL' and value->>'environment'='SANDBOX' and value->>'billing_country'='US'
     and value->>'binding_id'='d155bb01-0000-4000-8000-000000000001'
     and value->'scope'='{"account_id":"binding-account-v1","merchant_id":"binding-merchant-v1"}'::jsonb
     and value->'expected_application'='{"paypal_client_id":"binding-client-v1"}'::jsonb,'NATIVE_PAYPAL_V1';
   else
    assert item->>'label'='B4' and value->>'provider'='PORTONE' and value->>'environment'='TEST'
     and value->>'billing_country'='KR' and value->'expected_application'='null'::jsonb
     and value->'scope'='{"merchant_id":"binding-portone-merchant","store_id":"binding-portone-store","channel_id":"binding-portone-channel","channel_type":"TEST"}'::jsonb,
     'NATIVE_PORTONE_METADATA';
   end if;
  end if;
  native:=native||jsonb_build_object(item->>'label',jsonb_build_object('ok',true,'value',value));
 end loop;
 perform set_config('provider_rpc.observation',jsonb_build_object(
  'label',current_setting('provider_rpc.observation_label'),'sessionUser',session_user,'currentUser',current_user,
  'timezone',current_setting('TimeZone'),'controlState',control_state,
  'productDigest',encode(extensions.digest(convert_to(product_state::text,'UTF8'),'sha256'),'hex'),
  'controlDigest',encode(extensions.digest(convert_to(control_state::text,'UTF8'),'sha256'),'hex'),
  'financialCounts',counts,'fullCounts',full_counts,'financialZero',true,'fullZero',true,'aclValid',true,'native',native)::text,true);
end $$;
select 'PROVIDER_RPC_OBSERVATION '||current_setting('provider_rpc.observation');
rollback;
select 'PROVIDER_RPC_OBSERVER_COMPLETE';
