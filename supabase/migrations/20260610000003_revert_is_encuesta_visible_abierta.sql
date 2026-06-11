-- Revert: remove e.abierta = true from is_encuesta_visible
-- Open surveys should NOT be visible via RLS (only via deep link + vote)

create or replace function public.is_encuesta_visible(p_id_encuesta uuid, p_phone text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.encuestas e
    where e.id = p_id_encuesta
      and (
        e.owner = p_phone
        or exists (
          select 1 from public.encuestas_usuarios eu
          where eu.id_encuesta = e.id and eu.phone_usuario = p_phone
        )
        or exists (
          select 1 from public.encuestas_ha_votado hv
          join public.profiles pr on pr.id = hv.user_id
          where hv.id_encuesta = e.id and pr.phone = p_phone
        )
      )
  );
$$;