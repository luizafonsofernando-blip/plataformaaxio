# Integração do módulo Property na Plataforma Luce

Este pacote foi preparado para integração do módulo Property na plataforma Luce.

## Arquivos principais

- `PropertyModule.tsx`: componente React para adicionar na aba/módulo `Property`.
- `supabaseClient.ts`: cliente Supabase apontando para `https://prznhgwiibcazuwlwvnt.supabase.co`.
- `property-auth.ts`: regra de perfis `admin` e `user`.
- `luce-property-demo.html`: cópia do sistema atual para publicar em `public/property/`.
- `luce-logo.svg`: logo usada pelo módulo.
- `supabase-security-starter.sql`: políticas iniciais de RLS.

## Como plugar na landing page

1. Copie `luce-property-demo.html` e `luce-logo.svg` para:

   `public/property/`

2. Copie `PropertyModule.tsx`, `supabaseClient.ts` e `property-auth.ts` para a pasta de componentes/módulos da landing page.

3. Na lista de módulos da landing page, adicione uma opção:

   - Nome: `Property`
   - Componente: `PropertyModule`

4. Configure o `.env` do projeto:

   ```env
   VITE_SUPABASE_URL=https://prznhgwiibcazuwlwvnt.supabase.co
   VITE_SUPABASE_ANON_KEY=chave_anon_public_do_supabase
   ```

5. No Supabase, rode/adapte o arquivo:

   `supabase-security-starter.sql`

## Perfis planejados

- `admin`: acesso total a todas as entidades e todos os módulos.
- `user`: acesso apenas a Orteconte Contabilidade Ltda. e São Cipriano Participações.

## Observação importante

A URL do Supabase e o formato de configuração já estão preparados. Use sempre a chave `anon public` no frontend; nunca use a `service_role` no navegador.
