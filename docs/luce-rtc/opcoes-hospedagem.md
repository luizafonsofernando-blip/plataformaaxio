# Hospedagem dos motores RTC: decisão pendente

Avaliação em 17/11/2026. Nenhuma conta, recurso pago ou ambiente foi criado.

Os motores Regular e Simples são aplicações Java 21 que leem base SQLite local em modo somente leitura. Essa base deve ser gerada com Flyway durante um build controlado e incorporada à imagem imutável, com versão e checksum registrados. O DANFSe é um serviço Go. Os três processos precisam de hospedagem de contêineres, rede privada, recursos de memória adequados e observabilidade. O gateway HTTPS é o único ponto externo e exige token; o portal permanece na Vercel.

| Opção | Vantagem | Cuidado |
| --- | --- | --- |
| Render, recomendado para a primeira homologação | Serviços privados e rede interna simples; web service com TLS gerenciado para o gateway; integração por repositório/imagem | Quatro serviços ativos geram custo recorrente; verificar memória necessária e preço antes de contratar. Não é necessário disco persistente se a base SQLite for incorporada à imagem e aberta somente para leitura. |
| Google Cloud Run | Escala sob demanda, serviços privados com IAM, boa segregação | Configuração maior de build, contas de serviço, autenticação entre serviços e proteção do gateway; filesystem temporário exige base SQLite incorporada à imagem ou storage apropriado. |
| VPS com Docker/Compose | Controle total e potencialmente menor custo de infraestrutura | A Luce fica responsável por sistema operacional, firewall, TLS, atualização, backup, monitoramento e resposta a incidentes. |

O Supabase principal está no plano que não disponibiliza branches. Há um projeto de homologação de outro módulo, mas não deve ser reutilizado para RTC sem análise de isolamento e impacto. Alternativas para testes RTC: banco PostgreSQL local isolado, novo projeto Supabase dedicado, ou upgrade para plano com branching. Qualquer opção com cobrança exige decisão de orçamento antes da criação.

**Decisão sugerida:** começar com Render para os motores e gateway, e banco local isolado para CI; só criar Supabase de homologação quando os testes de API e RLS locais estiverem completos. Antes de qualquer contratação, estimar quatro instâncias, memória, build, egress e duração mensal no painel do provedor. A produção exige homologação tributária, teste de carga, restore de backup e autorização expressa.
