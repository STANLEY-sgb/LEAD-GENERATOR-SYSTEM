-- Atomic lead ingestion: suppression check, exact-email dedupe, candidate detection, history, score, activity.
-- Service-role only (called by trusted server code: public forms, webhooks, connectors, workers).
create or replace function public.ingest_lead(p_org uuid, p_lead jsonb, p_score jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := nullif(p_lead->>'email_n','');
  v_phone text := nullif(p_lead->>'phone_n','');
  v_domain text := nullif(p_lead->>'domain_n','');
  v_id uuid; v_existing uuid; v_stage uuid; v_source text := coalesce(p_lead->>'source','manual');
begin
  if not exists (select 1 from public.organizations o where o.id = p_org and o.status = 'active' and o.deleted_at is null) then
    return jsonb_build_object('outcome','rejected','reason','organization inactive');
  end if;

  if exists (select 1 from public.suppression_list s where s.organization_id = p_org
             and ((v_email is not null and s.email_normalized = v_email) or (v_phone is not null and s.phone_normalized = v_phone))) then
    return jsonb_build_object('outcome','suppressed');
  end if;

  if v_email is not null then
    select l.id into v_existing from public.leads l where l.organization_id = p_org and l.email_normalized = v_email and l.deleted_at is null;
  end if;

  if v_existing is null then
    select s.id into v_stage from public.pipeline_stages s where s.organization_id = p_org and s.kind = 'open' order by s.position limit 1;
    begin
      insert into public.leads (organization_id, name, company, email, phone, website, country, industry, source, stage_id, status,
                                phone_normalized, domain_normalized, consent_status, consent_evidence, legal_basis, campaign_id,
                                score, qualification, field_provenance)
      values (p_org, coalesce(nullif(p_lead->>'name',''), nullif(p_lead->>'company',''), 'Unknown'), p_lead->>'company', v_email, p_lead->>'phone',
              p_lead->>'website', p_lead->>'country', p_lead->>'industry', v_source, v_stage, 'new',
              v_phone, v_domain, coalesce(p_lead->>'consent_status','unknown'), coalesce(p_lead->'consent_evidence','{}'::jsonb),
              p_lead->>'legal_basis', nullif(p_lead->>'campaign_id','')::uuid,
              (p_score->>'score')::int, p_score->>'qualification', coalesce(p_lead->'provenance','{}'::jsonb))
      returning id into v_id;
    exception when unique_violation then
      select l.id into v_existing from public.leads l where l.organization_id = p_org and l.email_normalized = v_email and l.deleted_at is null;
    end;
  end if;

  if v_existing is not null then
    insert into public.lead_sources_history (organization_id, lead_id, source, source_ref, attribution, raw)
    values (p_org, v_existing, v_source, p_lead->>'source_ref', p_lead->>'attribution', coalesce(p_lead->'raw','{}'::jsonb));
    insert into public.lead_activities (organization_id, lead_id, type, body)
    values (p_org, v_existing, 'duplicate_seen', 'Seen again via ' || v_source);
    return jsonb_build_object('outcome','duplicate','lead_id',v_existing);
  end if;

  insert into public.lead_sources_history (organization_id, lead_id, source, source_ref, attribution, raw)
  values (p_org, v_id, v_source, p_lead->>'source_ref', p_lead->>'attribution', coalesce(p_lead->'raw','{}'::jsonb));
  insert into public.lead_scores (organization_id, lead_id, score, qualification, factors, explanation)
  values (p_org, v_id, (p_score->>'score')::int, p_score->>'qualification', coalesce(p_score->'factors','[]'::jsonb), coalesce(p_score->>'explanation',''));
  insert into public.lead_activities (organization_id, lead_id, type, body, metadata)
  values (p_org, v_id, 'created', 'Lead created via ' || v_source, jsonb_build_object('source', v_source));

  -- Phone/domain matches are only *candidates*: identity is uncertain, so humans decide on merging.
  insert into public.duplicate_candidates (organization_id, lead_id, other_lead_id, reason)
  select p_org, v_id, l.id, case when v_phone is not null and l.phone_normalized = v_phone then 'same phone number' else 'same organization domain' end
  from public.leads l
  where l.organization_id = p_org and l.id <> v_id and l.deleted_at is null
    and ((v_phone is not null and l.phone_normalized = v_phone) or (v_domain is not null and l.domain_normalized = v_domain))
  limit 5
  on conflict do nothing;

  return jsonb_build_object('outcome','created','lead_id',v_id);
end $$;
revoke execute on function public.ingest_lead(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_lead(uuid, jsonb, jsonb) to service_role;
