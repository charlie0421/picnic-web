\set ON_ERROR_STOP on
begin;
do $$ begin
 assert session_user='postgres' and current_user='postgres';
 assert (select not rolsuper and not rolbypassrls from pg_roles where rolname=current_user);
end $$;
update public.web_payment_provider_settings set mode='CLOSED',allow_new_orders=false,allow_charge=false,
 verification_binding_id='c755aa02-0000-4000-8000-000000000002',
 paypal_account_id='ctx-account-rotated',paypal_merchant_id='ctx-merchant-rotated'
 where provider='PAYPAL' and environment='SANDBOX';
update public.web_payment_provider_settings set mode='CLOSED',allow_new_orders=false,allow_charge=false,
 verification_binding_id='c755aa02-0000-4000-8000-000000000004',
 portone_merchant_id='ctx-pg-rotated',portone_store_id='ctx-store-rotated',portone_channel_id='ctx-channel-rotated'
 where provider='PORTONE' and environment='TEST';
update public.user_profiles set deleted_at=clock_timestamp() where id='c755aa01-0000-4000-8000-000000000003';
do $$ begin
 assert (select count(*)=2 from public.web_payment_provider_settings where is_current_environment
  and mode='CLOSED' and not allow_charge and not allow_new_orders);
 assert (select deleted_at is not null from public.user_profiles where id='c755aa01-0000-4000-8000-000000000003');
end $$;
commit;
select 'CHARGE_CONTEXT_STOP_COMPLETE';
