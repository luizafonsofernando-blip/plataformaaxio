# LUCE Sign

Módulo do Portal Luce para assinatura eletrônica por link individual. Reutiliza o Supabase Auth dos demais módulos para operadores, PostgreSQL e bucket privado. O Admin01 tem acesso à organização inicial do Sign; outros usuários dependem de permissão e associação à organização.

## Fluxo

1. Operador autorizado cria o documento, envia PDF de até 2 MB, cadastra signatários e posições, e prepara o documento.
2. **Gerar links de assinatura** cria ou recupera um link individual por signatário. O painel permite copiar novamente enquanto o token estiver válido. Não há envio automático por e-mail, WhatsApp ou outro serviço.
3. O operador gera um código de seis dígitos para cada signatário e o entrega por canal separado do link. O código expira em dez minutos e tem limites de emissão e tentativas. Como alternativa, quem já possui conta confirmada no Portal pode autenticar-se com suas próprias credenciais, desde que o e-mail seja o mesmo do cadastro do signatário.
4. Somente após a autenticação adicional o PDF original é exibido. O signatário pode aceitar expressamente e assinar ou recusar. O operador pode revogar links ou cancelar o documento. O acesso ao link, isoladamente, não comprova identidade.
5. Após todas as assinaturas, o servidor gera o PDF final e o relatório de evidências, preservando original, hashes SHA-256, eventos, datas, IP observado, user-agent e protocolo público de verificação. Arquivos ficam no bucket privado.

O relatório descreve a modalidade efetivamente usada. **A plataforma não verifica a entrega manual do código nem comprova, por si só, a identidade civil do destinatário.** O operador deve confirmar a identidade e usar um canal separado antes de entregar o código. Não enviar link e código na mesma mensagem.

## Configuração

Variáveis server-side: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SIGN_PUBLIC_BASE_URL` (HTTPS), `SIGN_TOKEN_SECRET` (segredo aleatório de pelo menos 32 caracteres) e, opcionalmente, `SIGN_LINK_VALIDITY_DAYS` (1 a 30; padrão 7). Nenhuma variável de Resend ou SMTP é necessária. Ver [`.env.example`](.env.example).

As migrations aditivas de `20261115` criam a estrutura do módulo, vinculam o Admin01, endurecem funções e adicionam autenticação por conta, recusa e cancelamento. Foram aplicadas ao projeto Supabase principal em 15/11/2026. As tabelas `sign_*` usam RLS; `anon` e `authenticated` não recebem acesso direto, e as funções operacionais são restritas à `service_role` no servidor.

## Limitações e validação

O fluxo atual **não contém PAdES, certificado A1 nem validação ITI**. Não afirmar que o cliente assinou com ICP-Brasil. A selagem criptográfica opcional permanece pendente de implementação e homologação.

Executar `node --test tests/luce-sign.test.mjs tests/luce-sign-flow.test.mjs tests/luce-sign-api.test.mjs tests/luce-sign-schema.test.mjs`, `node scripts/check-orthography.js` e `node scripts/build-public.mjs`. O teste de schema usa PGlite e confirma grants, RLS, Admin01, assinatura, recusa, cancelamento e cadeia de eventos. Antes de uso contratual real, ainda são necessários testes E2E com contas e dispositivos distintos, revisão jurídica/LGPD, backup e restauração, isolamento de processamento de PDFs não confiáveis e validação independente dos documentos finais. A finalização ocorre na função HTTP e pode ser retomada manualmente.

O comando geral `pnpm check` desta cópia permanece interrompido por referência antiga a `sentinela/sentinela.js`, arquivo ausente e fora do escopo do Sign.
