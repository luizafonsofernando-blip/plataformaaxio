# Homologação RTC inteiramente local

Data: 18/11/2026. Este roteiro não se vincula a nenhum projeto Supabase hospedado.

## Alternativa nativa no Windows (sem Docker)

Os repositórios oficiais fixados em `%LOCALAPPDATA%\LuceRTC` podem ser executados nativamente quando Java 21+ e Go 1.27+ estiverem instalados. Nesta máquina, `java`, `mvn` e `go` não estão no PATH; por isso, nenhuma consulta ou cálculo fiscal real foi executado nesta rodada. O Maven Wrapper (`mvnw.cmd`) dispensa uma instalação global do Maven, mas depende de Java 21+ e baixa dependências na primeira execução.

1. Execute `prepare-engines.ps1` para conferir os commits oficiais fixados. Não atualize as fontes sem revisar versão, contrato e casos de referência.
2. Em `%LOCALAPPDATA%\LuceRTC\regular`, crie `calculadora\db` e execute `mvnw.cmd flyway:migrate -Dflyway.configFiles=flyway\flyway-pro.conf --batch-mode --errors`. Depois execute `mvnw.cmd clean test jacoco:report` e `mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=offline"`.
3. Em `%LOCALAPPDATA%\LuceRTC\simples`, repita a geração do banco e os testes com o Maven Wrapper. A pasta `flyway` deve estar preparada pelo `prepare-engines.ps1`; execute o perfil `offline` na porta 8082, conforme o README da versão fixada.
4. Em `%LOCALAPPDATA%\LuceRTC\danfse`, configure `SERVER_PORT=8081` e execute `go run ./cmd/danfse`; valide os testes oficiais e o health check antes de qualquer XML de teste.

Os serviços nativos **não** devem ser expostos na rede pública. O gateway existente foi concebido para isolar os motores, exigir token e permitir apenas consultas de leitura previamente listadas. Ainda falta configurar e testar uma execução nativa equivalente ao `compose.yaml` (portas, autenticação e isolamento); não conecte o portal diretamente aos processos Java/Go. A existência de uma resposta HTTP não constitui homologação fiscal: compare casos verificáveis, versões e memória de cálculo antes de habilitar cálculo no Luce.

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

O `prepare.ps1` copia **somente as migrations RTC** para o projeto local independente. As portas são 55321 (API), 55322 (Postgres), 55323 (Studio), 55324 (e-mail local) e 58080 (gateway). Os arquivos de migrations copiados ficam ignorados pelo Git. O script recusa um diretório local que tenha referência a projeto remoto. O `run-local.ps1` confere que a API é exatamente `http://127.0.0.1:55321` antes de carregar as chaves locais. Nenhum segredo é salvo no repositório.

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
