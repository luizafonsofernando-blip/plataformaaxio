# Homologação RTC inteiramente local

Data: 18/11/2026. Este roteiro não se vincula a nenhum projeto Supabase hospedado.

## Preparação

É necessário instalar e iniciar Docker Desktop (ou runtime compatível) no Windows. A instalação pode exigir WSL 2, privilégios administrativos e reinicialização. Nesta máquina, Docker e WSL não estavam disponíveis na verificação de 18/11/2026; portanto os contêineres e o Supabase local **não foram iniciados**. Não use `supabase link`, `db push`, `db reset --remote` ou chaves dos projetos hospedados neste roteiro.

Em um **mesmo terminal PowerShell**, na raiz do branch RTC:

```powershell
& .\infra\rtc-local\prepare.ps1
pnpm dlx supabase start --workdir infra/rtc-local
& .\infra\rtc-local\create-test-admin.ps1
$env:RTC_GATEWAY_TOKEN = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
& .\infra\rtc-local\prepare-engines.ps1
docker compose -f infra/rtc-local/compose.yaml build
docker compose -f infra/rtc-local/compose.yaml up -d
& .\infra\rtc-local\smoke-engines.ps1
& .\infra\rtc-local\run-local.ps1
```

O `prepare.ps1` copia **somente as duas migrations RTC** para o projeto local independente. As portas são 55321 (API), 55322 (Postgres), 55323 (Studio), 55324 (e-mail local) e 58080 (gateway). Os arquivos de migrations copiados ficam ignorados pelo Git. O script recusa um diretório local que tenha referência a projeto remoto. O `run-local.ps1` confere que a API é exatamente `http://127.0.0.1:55321` antes de carregar as chaves locais. Nenhum segredo é salvo no repositório.

O administrador criado é apenas de teste, com e-mail/senha escolhidos no terminal. No mesmo terminal, o script define `RTC_BOOTSTRAP_ADMIN_USER_ID`; só esse usuário pode criar a organização inicial. A tela de homologação estará em `http://127.0.0.1:3000/reforma-tributaria/` depois de `run-local.ps1` iniciar. Não reutilize credenciais reais.

O `prepare-engines.ps1` obtém os três repositórios da organização `ReceitaFederal`, verifica os commits das tags fixadas e prepara as fontes em `%LOCALAPPDATA%\LuceRTC`, fora do repositório. O Simples recebe a pasta Flyway da release Regular, conforme a documentação oficial. Os contêineres Java e Go são separados e não têm portas publicadas; somente o gateway é acessível em `127.0.0.1:58080` mediante token. A opção HTTP do conector é aceita exclusivamente no loopback e fora de `NODE_ENV=production`.

## Aceite técnico e fiscal

1. Executar `pnpm run check:rtc`; confirmar isolamento entre organizações, usuários suspensos, relatórios privados, hashes e imutabilidade.
2. Construir os contêineres e executar `smoke-engines.ps1`. Registrar versões, versões de base, contagem e logs de falhas sem dados sensíveis. A URL configurada ou um teste de mock **não** prova que o motor oficial está operacional.
3. Comparar respostas do Regime Regular e Simples para datas de vigência distintas com exemplos oficiais. Para cálculo, adicionar entradas e saídas de referência e revisão por profissional fiscal; nenhuma simulação deve ser exibida como vinculante.
4. Validar DANFSe com XML oficial de teste e PDF de referência antes de permitir geração. O probe de prontidão não equivale a esse aceite.
5. Testar login, permissões, RLS, acesso cruzado, criação de empresa, histórico, auditoria e download temporário de relatório com usuários locais distintos.
6. Verificar backup e restauração do banco local antes de cogitar migração hospedada. O projeto principal e a homologação e-BEF não participam deste fluxo.

Estado atual: migrations e testes locais embutidos preparados; checkout dos três commits oficiais realizado; execução real de Supabase CLI e contêineres bloqueada pela ausência de Docker/WSL. Nenhum cálculo fiscal ou relatório tributário real foi homologado.
