-- Public contact intake must remain available to visitors, but this function
-- only permits a bounded insert into the dedicated contact table.
create or replace function public.submit_contact_message(
  sender_name text,
  sender_phone text default null,
  sender_email text default null,
  message_subject text default null,
  message_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  message_id uuid;
begin
  if nullif(trim(sender_name), '') is null or nullif(trim(message_body), '') is null then
    raise exception 'contact_message_required';
  end if;

  if char_length(sender_name) > 120
    or char_length(coalesce(sender_phone, '')) > 40
    or char_length(coalesce(sender_email, '')) > 254
    or char_length(coalesce(message_subject, '')) > 180
    or char_length(message_body) > 4000 then
    raise exception 'contact_message_too_long';
  end if;

  insert into public.contact_messages(name, phone, email, subject, message)
  values (
    trim(sender_name),
    nullif(trim(sender_phone), ''),
    nullif(trim(sender_email), ''),
    nullif(trim(message_subject), ''),
    trim(message_body)
  )
  returning id into message_id;

  return message_id;
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text, text) to anon, authenticated;
