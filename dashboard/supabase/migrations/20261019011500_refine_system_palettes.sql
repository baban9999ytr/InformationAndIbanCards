update public.palette_definitions
set tokens = case name
  when 'Bilgi Default' then '{"background":"#111827","surface":"#1F2937","text":"#F3F4F6","primary":"#7DD3C7","accent":"#A7C7E7","muted":"#A8B3C2","button_text":"#111827"}'::jsonb
  when 'Bilgi Dark' then '{"background":"#111827","surface":"#1F2937","text":"#F3F4F6","primary":"#7DD3C7","accent":"#A7C7E7","muted":"#A8B3C2","button_text":"#111827"}'::jsonb
  when 'Emerald Corporate' then '{"background":"#12332F","surface":"#1D4740","text":"#E7F3EF","primary":"#75B8A8","accent":"#A7D6C7","muted":"#A4BDB7","button_text":"#12332F"}'::jsonb
  when 'Sunset Warmth' then '{"background":"#302522","surface":"#453633","text":"#F5EEE8","primary":"#D99A72","accent":"#D88B86","muted":"#C2AAA0","button_text":"#302522"}'::jsonb
  when 'Cyberpunk Neon' then '{"background":"#211A30","surface":"#322747","text":"#F2EDF8","primary":"#79C7C5","accent":"#C58BBF","muted":"#B5A9C4","button_text":"#211A30"}'::jsonb
  when 'Sahibinden Amber' then '{"background":"#202A3A","surface":"#303D50","text":"#F3F5F7","primary":"#D7AD55","accent":"#E1C77A","muted":"#B7C0CB","button_text":"#202A3A"}'::jsonb
  when 'Instagram Gradient Style' then '{"background":"#2B2035","surface":"#40304B","text":"#FAF4F8","primary":"#C67C9A","accent":"#D29A69","muted":"#C1B2C2","button_text":"#2B2035"}'::jsonb
  when 'LinkedIn Professional' then '{"background":"#142B3D","surface":"#23435A","text":"#F0F4F7","primary":"#73A9C8","accent":"#9CC4D8","muted":"#B2C0CB","button_text":"#142B3D"}'::jsonb
  else tokens
end,
updated_at = now()
where kind = 'system'
  and name in (
    'Bilgi Default',
    'Bilgi Dark',
    'Emerald Corporate',
    'Sunset Warmth',
    'Cyberpunk Neon',
    'Sahibinden Amber',
    'Instagram Gradient Style',
    'LinkedIn Professional'
  );
