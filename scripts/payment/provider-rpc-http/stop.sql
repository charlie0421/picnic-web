\set ON_ERROR_STOP on
begin;
do $$ begin
 assert session_user='postgres' and current_user='postgres' and current_database()='fixture';
 assert current_setting('plpgsql.check_asserts')='on';
 assert (select not rolsuper and not rolbypassrls from pg_roles where rolname=current_user);
end $$;
update public.web_payment_provider_settings set mode='CLOSED',allow_charge=false,allow_new_orders=false
where (provider,environment) in (('PAYPAL','SANDBOX'),('PORTONE','TEST'));
update public.user_profiles set deleted_at=clock_timestamp() where id='d155aa01-0000-4000-8000-000000000003';
do $$ begin
 assert (select count(*)=2 from public.web_payment_provider_settings where is_current_environment
  and mode='CLOSED' and not allow_charge and not allow_new_orders);
 assert (select deleted_at is not null from public.user_profiles where id='d155aa01-0000-4000-8000-000000000003');
end $$;
commit;
select 'PROVIDER_RPC_STOP_COMPLETE';
