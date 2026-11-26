-- Root-only observer; Node has no arbitrary SQL or table-write protocol.
-- Selected-source financial/history relations only. Registries, campaign
-- configuration, STAR cutover/check progress and the full production catalog
-- are outside this row-count claim. Missing relations fail; none are stubbed.
do $$ declare baseline jsonb:=current_setting('order_http.financial_baseline',true)::jsonb;
 relation_name text; role_name text; observed bigint;
 relations text[]:=array[
 'receipts','star_candy_history','star_candy_bonus_history',
 'wallet_financial_operations','wallet_credit_operations','wallet_credit_allocations',
 'wallet_debit_operations','wallet_debit_allocations','wallet_debit_bucket_allocations','wallet_repair_operations',
 'wallet_recovery_debts','wallet_recovery_debt_events','wallet_provider_event_inbox',
 'wallet_provider_verification_attestations','purchase_reward_snapshots','purchase_reward_allocations',
 'purchase_promotion_resolutions','purchase_promotion_resolution_events','purchase_promotion_awards',
 'purchase_promotion_resolution_inputs','wallet_promotion_time_attestations','purchase_refund_events','purchase_refund_allocations',
 'cotton_candy_grants','cotton_candy_ledger','wallet_star_lots','wallet_star_spend_allocations',
 'wallet_star_lot_retirements','wallet_star_lot_applications','wallet_star_lot_violations','wallet_bonus_projection_violations'];
begin
 assert current_database()='fixture' and current_setting('plpgsql.check_asserts')='on';
 foreach role_name in array array['wallet_command_owner','wallet_state_owner','wallet_attestation_owner'] loop
  assert not has_schema_privilege(role_name,'public','CREATE')
   and not has_schema_privilege(role_name,'wallet_private','CREATE'),'borrowed CREATE survived setup: '||role_name;
 end loop;
 -- postgres owns public in the source fixture. Only its borrowed private
 -- CREATE is revoked; requiring public CREATE denial would change the ACL.
 assert has_schema_privilege('postgres','public','CREATE')
  and not has_schema_privilege('postgres','wallet_private','CREATE'),'postgres source schema CREATE differs';
 assert baseline is not null and jsonb_typeof(baseline)='object','financial baseline is missing';
 assert (select count(*) from jsonb_object_keys(baseline))=cardinality(relations),'financial baseline catalog differs';
 foreach relation_name in array relations loop
  relation_name:='public.'||relation_name;
  assert to_regclass(relation_name) is not null,'missing selected-source financial relation: '||relation_name;
  assert baseline ? relation_name and (baseline->>relation_name)::bigint=0,'nonempty source-control baseline: '||relation_name;
  execute format('select count(*) from %s',relation_name::regclass) into observed;
  assert observed=(baseline->>relation_name)::bigint,'financial/history row count changed: '||relation_name;
 end loop;
end $$;
select jsonb_build_object('verifiedFinancialCounts',current_setting('order_http.financial_baseline')::jsonb,
 'schemaAcl',(select jsonb_agg(jsonb_build_object('schema',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl))
 from pg_namespace where nspname in ('public','wallet_private')));
do $$ declare rpc regprocedure:='public.create_web_payment_order(uuid,text,text,text,uuid,text)'::regprocedure;
begin
 assert current_database()='fixture' and current_setting('plpgsql.check_asserts')='on';
 assert (select count(*)=1 from public.web_payment_orders where user_id='a733bb01-0000-4000-8000-000000000001'
  and request_id='a733bb02-0000-4000-8000-000000000001'),'same request created more than one order';
 assert (select count(*)=1 from public.web_payment_orders where user_id='a733bb01-0000-4000-8000-000000000002'
  and request_id='a733bb02-0000-4000-8000-000000000001'),'B did not receive its own separate order';
 assert (select count(*)=0 from public.web_payment_orders where user_id='a733bb01-0000-4000-8000-000000000003'),'deleted actor created an order';
 assert (select count(*)=0 from public.web_payment_orders where request_id in (
 'a733bb02-0000-4000-8000-000000000010','a733bb02-0000-4000-8000-000000000011',
 'a733bb02-0000-4000-8000-000000000012','a733bb02-0000-4000-8000-000000000013',
 'a733bb02-0000-4000-8000-000000000014','a733bb02-0000-4000-8000-000000000015',
 'a733bb02-0000-4000-8000-000000000016','a733bb02-0000-4000-8000-000000000021',
 'a733bb02-0000-4000-8000-000000000022','a733bb02-0000-4000-8000-000000000023',
 'a733bb02-0000-4000-8000-000000000024')),'a rejected request persisted an order';
 assert (select count(*)=6 from public.web_payment_orders),'unexpected new orders (two seed + A/B + numeric max + direct service)';
 assert (select count(*)=6 from public.web_payment_quotes),'unexpected quote count';
 assert not exists(select 1 from public.web_payment_orders o join public.web_payment_quotes q on q.id=o.quote_id
  where q.expires_at-q.issued_at<>interval '15 minutes' or q.quote_hash<>o.quote_hash
  or q.quote_hash<>encode(extensions.digest(convert_to(q.quote::text,'UTF8'),'sha256'),'hex')),'quote/hash/lifetime changed';
 assert not exists(select 1 from public.web_payment_orders where payment_state<>'NOT_SUBMITTED' or settlement_state<>'NOT_INTAKE'),
  'order HTTP performed a charge or settlement';
 assert not exists(select 1 from public.purchase_reward_snapshots),'HTTP created a financial snapshot';
 assert not exists(select 1 from public.purchase_reward_allocations),'HTTP created a financial allocation';
 assert not exists(select 1 from public.wallet_provider_event_inbox),'HTTP created a provider inbox';
 assert not exists(select 1 from public.wallet_recovery_debts),'HTTP created wallet debt';
 assert has_function_privilege('service_role',rpc,'EXECUTE') and not has_function_privilege('anon',rpc,'EXECUTE')
  and not has_function_privilege('authenticated',rpc,'EXECUTE'),'source RPC ACL changed';
 assert not has_schema_privilege('wallet_command_owner','public','CREATE')
  and not has_schema_privilege('wallet_command_owner','wallet_private','CREATE'),'borrowed CREATE survived setup';
 assert (select not rolsuper and not rolbypassrls from pg_roles where rolname='postgres'),'postgres bypasses source guards';
 assert (select bool_and(relrowsecurity) from pg_class where oid in ('public.web_payment_orders'::regclass,
  'public.web_payment_quotes'::regclass,'public.web_payment_provider_settings'::regclass)),'source RLS changed';
 if to_regclass('public.web_payment_verification_results') is not null then
  assert not exists(select 1 from public.web_payment_verification_results),'HTTP produced FULL verification';
  assert not exists(select 1 from public.web_payment_full_verification_proofs),'HTTP produced a FULL proof';
  assert not exists(select 1 from public.web_payment_settlements),'HTTP performed a FULL settlement';
  assert not exists(select 1 from public.web_payment_settlement_leases),'HTTP claimed a settlement lease';
 end if;
end $$;
-- Preserve raw issued_at microseconds and immutable row hashes for comparison
-- with the Node proxy's original PostgREST response and the public DTO.
select jsonb_build_object('orders',jsonb_agg(jsonb_build_object('order_id',o.id,'user_id',o.user_id,
 'request_id',o.request_id,'request_hash',o.request_hash,'quote_hash',q.quote_hash,'quote',q.quote)))
 from public.web_payment_orders o join public.web_payment_quotes q on q.id=o.quote_id;
select 'order-http-observer-complete';
