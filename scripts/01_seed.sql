insert into public.hotels (name, property_details)
values ('Riverside Inn','{}'),('City Lodge','{}')
on conflict do nothing;

insert into public.employers (name)
values ('Acme Construction')
on conflict do nothing;
