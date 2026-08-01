-- Diagnóstico + garante Master na conta admin.
-- Cole no SQL Editor do Supabase e rode.

-- 1) Quem é o admin e qual o papel atual?
select u.id, u.email, r.role
from auth.users u
left join public.user_roles r on r.user_id = u.id
where u.email in ('admin@vendas-app.interno', 'admin@caixadobairro.interno')
   or u.email ilike 'admin%';

-- 2) Promove para master
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where email in ('admin@vendas-app.interno', 'admin@caixadobairro.interno')
  order by created_at
  limit 1;

  if v_user_id is null then
    raise notice 'Conta admin não encontrada';
  else
    insert into public.user_roles (user_id, role)
    values (v_user_id, 'master'::public.user_role)
    on conflict (user_id) do update
      set role = 'master'::public.user_role,
          updated_at = now();
    raise notice 'Master OK: %', v_user_id;
  end if;
end $$;

-- 3) Confirma
select u.email, r.role
from auth.users u
join public.user_roles r on r.user_id = u.id
where r.role = 'master'::public.user_role;
