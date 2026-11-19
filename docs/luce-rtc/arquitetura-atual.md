# Luce Reforma Tributária: auditoria e arquitetura

Verificação em 17/11/2026. Nenhuma alteração em produção ou no banco foi realizada.

## Base do Portal

- O deploy de produção `dpl_FJnshNCz4LRSFkKmUYHBLQ1Y2Hrt` foi publicado pela Vercel CLI em 17/11/2026 às 10h48 (BRT), sem commit GitHub associado.
- Os 307 arquivos enviados em `src/` foram recuperados da API da Vercel e cada um validado pelo hash SHA-1 registrado no deploy.
- A branch `archive/vercel-2026-11-17-1048` preserva os 263 arquivos versionáveis desse envio. Os arquivos temporários do Supabase e capturas de tela ficaram apenas na cópia local.
- Arquivos excluídos por `.vercelignore` não existem no arquivo do deploy. Portanto, a branch de arquivo não deve ser confundida com o repositório-fonte completo. Antes de mesclar ou publicar qualquer alteração, reconciliar esses arquivos com uma cópia local confiável.
- A `main` do GitHub permanece antiga; a cópia `Documents/plataformaaxio` tem alterações não commitadas e não foi modificada.

## Stack e controles observados

- Portal HTML/CSS/JavaScript; saída de build em `.luce-public`; APIs JavaScript em funções Vercel Node.js 24.
- Supabase Auth para usuários; `api/_security.js` valida sessão, status e módulos no backend. O novo módulo usa `reforma-tributaria` como identificador de permissão, sem concedê-la automaticamente a usuários comuns.
- Banco Supabase principal `prznhgwiibcazuwlwvnt`; tabelas existentes inspecionadas em leitura e com RLS ativo. Não foi criada tabela RTC.
- A estratégia de backup do banco, restauração testada, segredos e ambiente de homologação RTC ainda requer confirmação específica.

## Motores oficiais

| Motor | Release verificada | Commit da tag | Licença | Runtime |
| --- | --- | --- | --- | --- |
| [Regime Regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/releases/tag/1.6.1) | 1.6.1 | `150cccbe414d` | MIT | Java 21+ |
| [Simples Nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/releases/tag/0.0.6) | 0.0.6 | `c5b0f01c8351` | MIT | Java |
| [Gerador DANFSe](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse/releases/tag/1.0.0) | 1.0.0 | `8d79e6b2f7fa` | MIT | Go |

As referências pertencem à organização `ReceitaFederal`. Ainda não houve instalação, revisão de todas as dependências, implantação, homologação de API ou comparação com casos tributários oficiais.

## Plano incremental

1. Preservar e reconciliar a fonte do portal; manter esta branch isolada, sem merge na `main`.
2. Preparar ambiente de homologação separado, com serviços persistentes para os motores e Supabase isolado.
3. Revisar Swagger/OpenAPI, exemplos e limitações das releases fixadas; selecionar um caso oficial pequeno como primeira integração vertical.
4. Modelar organização, empresa, permissão e histórico imutável de cálculo; criar migrations aditivas e testes de RLS entre empresas.
5. Implementar gateway autenticado para o motor oficial, com entrada validada, timeout, limite, rastreabilidade e versão de regras. Nenhum cálculo fiscal no frontend.
6. Adicionar interface e relatórios para operações realmente suportadas, com estados explícitos para indisponibilidade e casos não implementados.
7. Rodar testes tributários, de segurança, regressão e acessibilidade; publicar somente após homologação e autorização expressa.

## Riscos prioritários

- Código-fonte incompleto por exclusões da `.vercelignore`: reconciliar antes de qualquer publicação.
- Resultado fiscal incorreto: motor oficial pinado, caso de referência e data de vigência obrigatórios.
- Vazamento entre empresas: autorização server-side, RLS e testes de acesso cruzado.
- Serviço tributário indisponível: nunca mascarar falha como cálculo bem-sucedido.
- XML malicioso: limites, parser seguro, sem entidades externas e testes adversariais.
- Atualização oficial: revisão e homologação manual antes de trocar a versão em uso.
