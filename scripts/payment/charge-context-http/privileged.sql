\set ON_ERROR_STOP on
-- INSERT-only synthetic history; this is not normal API reachability.
begin;
do $$
declare o public.web_payment_orders%rowtype;q public.web_payment_quotes%rowtype;
 label text;expiry timestamptz:='2026-11-01T01:02:03.123456Z';
begin
 assert session_user='postgres' and current_user='postgres';
 assert (select not rolsuper and not rolbypassrls from pg_roles where rolname=current_user);
 assert pg_has_role('postgres','wallet_command_owner','MEMBER');
 foreach label in array array['H1','H2'] loop
  select * into strict o from public.web_payment_orders where user_id='c755aa01-0000-4000-8000-000000000001'
   and id not in ('c755aa03-0000-4000-8000-000000000001','c755aa03-0000-4000-8000-000000000002')
   and product_id='CTXHTTP1' and provider='PAYPAL' and not exists
    (select 1 from public.web_payment_provider_contexts c where c.order_id=web_payment_orders.id);
  select * into strict q from public.web_payment_quotes where id=o.quote_id;
  o.id:=case when label='H1' then 'c755aa03-0000-4000-8000-000000000001'::uuid else 'c755aa03-0000-4000-8000-000000000002'::uuid end;
  o.request_id:=gen_random_uuid();q.id:=gen_random_uuid();q.order_id:=o.id;
  if label='H1' then
   q.expires_at:=expiry;q.issued_at:=expiry-interval '15 minutes';o.created_at:=q.issued_at;
   q.quote:=q.quote||jsonb_build_object('issued_at',q.issued_at,'expires_at',q.expires_at);
  else q.quote:=q.quote||'{"currency":null}'::jsonb;end if;
  q.quote_hash:=encode(extensions.digest(convert_to(q.quote::text,'UTF8'),'sha256'),'hex');
  o.quote_id:=q.id;o.quote_hash:=q.quote_hash;
  insert into public.web_payment_orders select (o).*;
  insert into public.web_payment_quotes select (q).*;
 end loop;
 set constraints all immediate;
end $$;
commit;
select jsonb_build_object('label',case when id='c755aa03-0000-4000-8000-000000000001'::uuid then 'H1' else 'H2' end,
 'actor',user_id,'order',id) from public.web_payment_orders
 where id in ('c755aa03-0000-4000-8000-000000000001','c755aa03-0000-4000-8000-000000000002') order by id;
select 'CHARGE_CONTEXT_PRIVILEGED_COMPLETE';
