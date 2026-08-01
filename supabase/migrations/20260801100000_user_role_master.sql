-- Novo papel de plataforma. Precisa ser commitado sozinho antes de usar
-- o valor em funções (mesmo padrão do enum payment_method 'mixed').
alter type public.user_role add value if not exists 'master';
