# Casa de Leilões de Carros

Casa de leilões online de carros: leiloeiros criam lotes a partir de veículos buscados em uma API pública e licitantes disputam cada lote com lances ao vivo.

| | |
| --- | --- |
| **Aplicação** | https://verzel-auction-house.vercel.app |
| **API** | https://casa-de-leiloes-api.onrender.com/api/health |
| **Contas de teste** | `leiloeiro@leilao.dev`, `ana@leilao.dev`, `bruno@leilao.dev` — senha `Senha@123` (botões prontos na tela de login) |

> A API está no plano gratuito do Render e "dorme" sem uso: **o primeiro acesso pode levar ~50 s**. Veja [Comportamentos inesperados e limitações](#comportamentos-inesperados-e-limitações).

## Stack

| Camada    | Tecnologia                          |
| --------- | ----------------------------------- |
| Front-end | Next.js 16 (React, App Router), Tailwind CSS |
| Back-end  | NestJS 12 (Node.js, TypeScript)     |
| Banco     | PostgreSQL 17 + Prisma ORM          |

## Estrutura

```
.
├── backend/            # API NestJS (porta 3001, prefixo /api) + Dockerfile
├── frontend/           # App Next.js (porta 3000) + Dockerfile + testes Playwright (e2e/)
└── docker-compose.yml  # PostgreSQL, API e front
```

## Deploy

| Parte | Serviço | Observação |
| ----- | ------- | ---------- |
| Front-end | **Vercel** — https://verzel-auction-house.vercel.app | Diretório raiz `frontend`, variável `NEXT_PUBLIC_API_URL` (tipo *Config*, com `/api` no fim) |
| API | **Render** (Docker, plano gratuito) — https://casa-de-leiloes-api.onrender.com/api | Criada pelo [`render.yaml`](render.yaml); WebSocket suportado |
| Banco | **Neon** (PostgreSQL gerenciado) | Conexão direta com `sslmode=require` |

- A API aplica as migrations a cada deploy e carrega os dados de demonstração **apenas se o banco estiver vazio**.
- No Render os segredos vêm das variáveis de ambiente (`REQUIRE_SECRETS=true`): o disco do plano gratuito é apagado a cada deploy, e uma chave de assinatura nova faria a auditoria acusar todos os lances antigos.
- **Comportamento esperado do plano gratuito**: a API "dorme" após ~15 min sem acesso; a primeira requisição depois disso leva ~50 s (o front mostra o carregamento e o tempo real reconecta sozinho). Lotes que terminarem enquanto a API dorme são liquidados assim que ela acorda.
- Variáveis da API: `DATABASE_URL`, `FRONTEND_URL` (domínio da Vercel, para o CORS), `BID_SIGNING_PRIVATE_KEY` (gerada com `npm run keys:generate`), `JWT_SECRET` e `PSEUDONYM_SECRET` (gerados pelo Render).
- Para testar o site, o leiloeiro pode criar a qualquer momento um lote ao vivo de poucos minutos (duração mínima de 5 min) e ver o anti-sniping, a liquidação e o comprovante acontecerem.

**Reiniciar a demonstração em produção** (apaga tudo e recria o seed, com os lotes ao vivo durando semanas). Roda da sua máquina, apontando para o Neon, com os **mesmos** segredos da API; o `.env` local não sobrescreve variáveis já definidas, mas qualquer uma esquecida viria do `.env` de desenvolvimento, por isso as três são passadas explicitamente:

```bash
cd backend
NODE_ENV=production SEED_ALLOW_RESET=true \
DATABASE_URL='<connection string do Neon>' \
PSEUDONYM_SECRET='<valor do PSEUDONYM_SECRET no Render>' \
BID_SIGNING_PRIVATE_KEY='<valor do BID_SIGNING_PRIVATE_KEY no Render>' \
npm run db:seed
```

## Rodando com Docker (mais simples)

Pré-requisito: Docker (Docker Desktop ou Colima).

```bash
docker compose up --build
```

Abra **http://localhost:3000** (a API fica em http://localhost:3001/api). Na primeira subida a API, sozinha:

1. gera os segredos (`JWT_SECRET`, chave de assinatura dos lances e segredo dos pseudônimos) e os guarda no volume `api-secrets` — eles não podem mudar depois, senão a auditoria acusaria os lances existentes como adulterados;
2. cria o banco `leilao_docker`, aplica as migrations e carrega os dados de demonstração (**só se o banco estiver vazio** — reiniciar não apaga nada).

Para recomeçar do zero: `docker compose down -v` (apaga os volumes). Para usar segredos próprios, defina-os em `environment` do serviço `api` no `docker-compose.yml`.

> A stack Docker usa o banco `leilao_docker`, separado do banco `leilao` do desenvolvimento local, cujos lances são assinados com as chaves do `backend/.env`.

## Rodando localmente (desenvolvimento)

Pré-requisitos: Node.js 20.11+ e Docker (Docker Desktop ou Colima).

```bash
# 1. Banco de dados (só o PostgreSQL)
docker compose up -d postgres

# 2. Back-end
cd backend
cp .env.example .env
npm install              # também gera o Prisma Client
npm run keys:generate    # copie as 2 linhas geradas para o .env
npm run db:deploy        # aplica as migrations
npm run db:seed          # dados de demonstração (apaga os dados existentes!)
npm run start:dev        # http://localhost:3001/api/health

# 3. Front-end (em outro terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev              # http://localhost:3000
```

## Dados de demonstração (seed)

Todos os usuários usam a senha `Senha@123`.

| Usuário                | Papel     | Saldo inicial  |
| ---------------------- | --------- | -------------- |
| `leiloeiro@leilao.dev` | Leiloeiro | —              |
| `ana@leilao.dev`       | Licitante | R$ 1.000.000   |
| `bruno@leilao.dev`     | Licitante | R$ 800.000     |
| `carla@leilao.dev`     | Licitante | R$ 1.500.000 (só participa de disputas, para haver lotes em que Ana e Bruno foram superados) |

Lotes criados (datas relativas ao momento em que o seed roda):

| Lote                     | Situação                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| Porsche 911 Carrera 2025 | Ao vivo (28 dias) — Ana ganhando com R$ 680.000                          |
| Ford Mustang 1965        | Ao vivo (25 dias) — Bruno ganhando com R$ 190.000                        |
| Chevrolet Camaro 2SS 2019 | Ao vivo (10 dias) — Carla ganhando, Bruno superado                      |
| Honda Civic 2017         | Ao vivo (12 dias) — Carla ganhando, Ana superada                         |
| Jeep Wrangler 2018       | Ao vivo (15 dias) — Carla com o único lance                              |
| Volkswagen Golf 2013     | Ao vivo (18 dias) — sem lances                                           |
| Chevrolet Opala 1978     | Ao vivo (21 dias) — sem lances                                           |
| Toyota Corolla Hatch 2018 | Ao vivo (23 dias) — sem lances                                          |
| BMW M3 Competition 2022  | Ao vivo (27 dias) — sem lances                                           |
| Nissan GT-R 2010         | Agendado (começa em 1 dia)                                               |
| Toyota GR Supra 2020     | Agendado (começa em 3 dias)                                              |
| Mercedes-AMG SL 43 2023  | Agendado (começa em 5 dias)                                              |
| Volkswagen Fusca 1966    | Encerrado sem lances (liquidado pelo job ao subir a API)                 |
| Fiat Uno 2011            | **Arrematado pela Ana** por R$ 32.000, com comprovante (link impresso pelo seed) |

Os lances e a liquidação do seed passam pelos mesmos serviços da aplicação (mesmas regras, hash, assinatura e comprovante). Como nos lotes criados pelo app, o seed guarda uma **cópia de cada foto** no banco (baixadas uma a uma, porque a Wikimedia responde `429` a rajadas); os testes e2e pulam esse download (`SEED_SKIP_IMAGES=true`) para não depender da internet. Rodar `npm run db:seed` de novo restaura esse estado. Em produção o seed só roda com `SEED_ALLOW_RESET=true`.

## Banco de dados

- Valores monetários são guardados em **centavos** (inteiros), nunca em ponto flutuante. Limite: R$ 21.474.836,47 por valor.
- O status do lote (agendado / ao vivo / encerrado) é **calculado pelo horário**, não armazenado; apenas o cancelamento é gravado.
- Regras de negócio críticas também são garantidas por **CHECK constraints** no PostgreSQL (ex.: saldo comprometido nunca maior que o saldo total), protegendo os dados mesmo em caso de bug na aplicação.
- Datas usam precisão de milissegundos (`timestamptz(3)`), a mesma do JavaScript, para que o hash dos lances (auditoria) seja recalculado exatamente igual.

Comandos úteis (em `backend/`): `npm run db:migrate` (cria/aplica migrations em dev), `npm run db:studio` (interface visual do banco).

## Autenticação

| Método | Rota                 | Acesso  | Descrição                                     |
| ------ | -------------------- | ------- | --------------------------------------------- |
| POST   | `/api/auth/register` | público | Cadastro (`role`: `AUCTIONEER` ou `BIDDER`)   |
| POST   | `/api/auth/login`    | público | Retorna `accessToken` (JWT) e o usuário       |
| GET    | `/api/auth/me`       | logado  | Dados do usuário autenticado                  |

- O token é enviado no header `Authorization: Bearer <token>`. Optamos por header em vez de cookie porque front (Vercel) e API ficam em domínios diferentes, onde cookies de terceiros costumam ser bloqueados pelos navegadores.
- **Rotas protegidas por padrão**: um guard global exige login em todas as rotas; as públicas (vitrine, auditoria, comprovante) são marcadas explicitamente com `@Public()`.
- **Papéis**: `@Roles('AUCTIONEER')` / `@Roles('BIDDER')` restringe rotas. Leiloeiros não conseguem acessar rotas de lance.
- **Senhas** com `scrypt` (nativo do Node, salt aleatório, comparação em tempo constante).
- **Login**: mensagem genérica ("E-mail ou senha inválidos") e mesmo tempo de resposta para e-mail inexistente, evitando descobrir quais e-mails têm conta. Limite de tentativas por IP (`AUTH_RATE_LIMIT`, padrão 10/min).
- A API não sobe se `JWT_SECRET` estiver ausente, curto ou, em produção, com o valor de exemplo do `.env.example`.

## API externa de veículos

Os carros vêm de duas APIs públicas, sem chave de acesso:

- **[NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/)** (governo dos EUA): marcas e modelos por ano.
- **[Wikipedia](https://en.wikipedia.org/w/api.php)**: fotos (a NHTSA não tem imagens). São devolvidas até 4 fotos e o leiloeiro escolhe a que melhor representa o carro — a foto principal do artigo nem sempre é do ano pesquisado. As imagens são do Wikimedia Commons; a página de origem é guardada para atribuição.

| Método | Rota                                                  | Acesso    |
| ------ | ----------------------------------------------------- | --------- |
| GET    | `/api/vehicles/makes?q=toy`                           | leiloeiro |
| GET    | `/api/vehicles/models?makeId=448&year=2020`           | leiloeiro |
| GET    | `/api/vehicles/images?make=Toyota&model=Supra&year=2020` | leiloeiro |

As respostas têm o formato `{ data, stale, fetchedAt }`.

### Resiliência (a aplicação continua utilizável se a API cair)

1. **Snapshot no lote**: ao criar um lote, os dados do carro (título, marca, modelo, ano, imagem, atributos) são copiados para o banco. Vitrine, sala ao vivo, auditoria e comprovante **nunca** chamam a API externa.
2. **Cache persistido no PostgreSQL** (tabela `external_api_cache`, validade de 7 dias): sobrevive a reinícios do servidor e reduz as chamadas (evita os limites de uso).
3. **Stale-if-error**: se a API falhar, o cache vencido é servido com `stale: true` (o front avisa que os dados podem estar desatualizados). Sem cache algum, a resposta é `503` com uma mensagem amigável.
4. **Timeout de 5 s e 1 nova tentativa** para erros transitórios (rede, timeout, HTTP 5xx e 429).
5. **Circuit breaker** por API: após 3 falhas seguidas, a API não é chamada por 30 s e o cache é usado direto, sem o usuário esperar timeouts. Uma falha na Wikipedia não afeta a NHTSA.

### Limitações conhecidas

- A NHTSA cobre o mercado americano a partir de **1981**; anos anteriores e modelos exclusivos do Brasil não existem nela. Os carros antigos do seed (Fusca, Opala, Mustang 1965) são dados de demonstração (`externalSource: "seed"`).
- A base da NHTSA tem alguns registros curiosos (ex.: réplicas de fabricantes pequenos). Os modelos são buscados pelo **ID** da marca, não pelo nome, porque a busca por nome casa parcialmente ("ford" retornava modelos da "STANFORD CUSTOMS").

## Lotes

| Método | Rota                      | Acesso          | Descrição                                                     |
| ------ | ------------------------- | --------------- | ------------------------------------------------------------- |
| POST   | `/api/lots`               | leiloeiro       | Cria um lote a partir de um veículo do catálogo               |
| GET    | `/api/lots?status=LIVE`   | público         | Vitrine (`LIVE`, `SCHEDULED`, `ENDED`) com `q`, `make`, `page`, `pageSize` |
| GET    | `/api/lots/:id`           | público         | Detalhe do lote (inclui `serverTime` para a contagem regressiva) |
| GET    | `/api/lots/:id/image`     | público         | Imagem do lote (cópia guardada no banco)                      |
| GET    | `/api/lots/mine`          | leiloeiro       | Painel: próprios lotes, resultado de cada um e total recebido |
| POST   | `/api/lots/:id/cancel`    | leiloeiro dono  | Cancela um lote não encerrado (`{ "reason": "..." }` obrigatório se já tiver lances) |

**Regras**

- **Status calculado pelo relógio do servidor**: agendado (`agora < início`), ao vivo (`início ≤ agora < fim`), encerrado (`agora ≥ fim`). O fim é exclusivo: no instante exato do fim o lote já está encerrado. Lotes cancelados não aparecem na vitrine, mas continuam acessíveis pelo id (comprovantes e auditoria).
- **Criação**: o front envia `makeId`, `modelId` e `year`; o servidor confere no catálogo e grava os nomes oficiais — não é possível criar lote de um carro que não veio da API. A imagem precisa ser uma das sugeridas (Wikimedia); uma cópia é baixada e guardada no banco (`lot_images`). Se o download falhar, o lote é criado mesmo assim e `/image` redireciona para a URL original.
- **Agenda**: início agora ou em até 90 dias (1 min de tolerância para "começar agora"); duração de 5 minutos a 30 dias.
- **Valores** em centavos, de R$ 1,00 a R$ 20.000.000,00 (folga abaixo do limite do `INTEGER` para os lances seguintes).
- **Cancelamento**: só o dono e só lotes **não encerrados** (mesmo antes da liquidação). A linha do lote é travada (`SELECT ... FOR UPDATE`) antes da verificação, então lance e cancelamento simultâneos são sempre processados um de cada vez — um teste e2e segura a trava numa conexão separada para provar isso.
  - **Sem lances**: cancelamento direto (motivo opcional) — é o requisito base do painel.
  - **Com lances — cancelamento com estorno automático (opcional do desafio)**: o **motivo é obrigatório** (5 a 300 caracteres). Na mesma transação, o valor comprometido do líder **volta ao saldo disponível** (o dinheiro estava apenas reservado, nunca foi debitado). O histórico de lances é mantido e continua íntegro na auditoria, que passa a acusar qualquer lance com horário posterior ao cancelamento. A sala e a vitrine recebem `lot:cancelled` com o motivo; o líder recebe o aviso privado `user:lot-cancelled` com o valor liberado. Lotes encerrados não podem ser cancelados: a liquidação já é o desfecho deles.
- **Painel do leiloeiro**: cada lote encerrado mostra `SOLD` (arrematado, com o valor), `UNSOLD` (sem lances) ou `AWAITING_SETTLEMENT` (encerrado, aguardando a liquidação automática).

## Carteira

| Método | Rota                   | Acesso    | Descrição                                                      |
| ------ | ---------------------- | --------- | -------------------------------------------------------------- |
| GET    | `/api/wallet`          | logado    | Saldo total, comprometido, disponível, lotes que comprometem o saldo e extrato |
| POST   | `/api/wallet/deposit`  | licitante | Depósito simulado (`{ "amountCents": 150000 }`)                |

- **Disponível = total − comprometido**, sempre calculado (nunca armazenado).
- **Comprometido** = soma dos lances em que o usuário é o líder atual, em lotes ainda não liquidados. Um lote encerrado continua comprometendo o valor até a liquidação debitá-lo.
- **Depósito atômico**: um único `UPDATE ... SET balance = balance + valor` com o teto verificado na mesma instrução, e o lançamento no extrato na mesma transação — depósitos simultâneos nunca se sobrescrevem.
- Limites: de R$ 1,00 a R$ 5.000.000,00 por depósito; saldo total de no máximo R$ 20.000.000,00.
- Leiloeiros também têm carteira (recebem as vendas), mas não podem depositar, pois não dão lances.

## Lances

| Método | Rota                        | Acesso    | Descrição                                          |
| ------ | --------------------------- | --------- | -------------------------------------------------- |
| POST   | `/api/lots/:id/bids`        | licitante | Dá um lance (`{ "amountCents": 6850000000 }`)      |
| GET    | `/api/lots/:id/bids`        | público   | Histórico de lances (só pseudônimos)              |
| GET    | `/api/lots/:id/my-status`   | licitante | Se está ganhando, posição e maior lance do usuário |

### Regras (todas no servidor, dentro de uma única transação)

1. **Trava do lote** (`SELECT ... FOR UPDATE`): lances concorrentes no mesmo lote são processados um de cada vez. O relógio é lido **depois** de obter a trava.
2. **Validações, nesta ordem** — cada recusa responde `422` com `{ code, message }`:

   | `code`                 | Mensagem                                                              |
   | ---------------------- | --------------------------------------------------------------------- |
   | `LOT_NOT_STARTED`      | Este lote ainda não foi iniciado                                      |
   | `LOT_ENDED`            | Este lote já foi encerrado                                            |
   | `LOT_CANCELLED`        | Este lote foi cancelado                                               |
   | `ALREADY_WINNING`      | Você já está ganhando este lote                                       |
   | `BELOW_MINIMUM`        | Lance abaixo do mínimo. O lance precisa ser de pelo menos R$ X        |
   | `INSUFFICIENT_BALANCE` | Saldo insuficiente. Seu saldo disponível é R$ X                       |

   O primeiro lance deve ser ≥ lance inicial; os seguintes ≥ lance atual + incremento mínimo.
3. **Trava das carteiras** do licitante e do líder anterior, sempre na mesma ordem (por id), evitando deadlock.
4. **Saldo comprometido**: o valor do líder anterior volta ao disponível **na mesma transação** em que ele é superado; o novo líder tem o valor comprometido. Vale entre lotes: o mesmo dinheiro não pode cobrir lances em dois lotes.
5. **Anti-sniping**: lance aceito quando faltam **2 minutos ou menos** muda o fim para **horário do lance + 2 minutos** (interpretação de "estende o fim do lote para +2 minutos"). O fim original continua guardado (`originalEndsAt`) e a resposta indica `extended: true`.

Os testes e2e provam a concorrência de forma determinística: uma conexão separada segura a trava enquanto dois lances são disparados; ao liberar, exatamente um é aceito. Removendo o `FOR UPDATE` do código, esses testes falham.

## Liquidação, comprovante e "meus arremates"

| Método | Rota                          | Acesso    | Descrição                                                   |
| ------ | ----------------------------- | --------- | ----------------------------------------------------------- |
| GET    | `/api/receipts/:shareCode`    | público   | Comprovante compartilhável (informa se a assinatura é válida) |
| GET    | `/api/bids/mine`              | licitante | Lotes em que deu lance, situação de cada um e comprovantes  |

**Job de liquidação** (a cada 5 s, `SETTLEMENT_INTERVAL_MS`):

1. Busca lotes com fim ≤ agora, não cancelados e não liquidados.
2. Para cada um, abre uma transação e trava o lote com `FOR UPDATE SKIP LOCKED` (se um lance está sendo processado nele, pula e tenta na próxima rodada). Confere de novo, sob a trava, se o lote continua encerrado e não liquidado — um lance de último segundo pode tê-lo prorrogado.
3. **Sem lances**: fecha sem vencedor. **Com lances**: trava as carteiras (mesma ordem dos lances), debita o vencedor (do saldo total e do comprometido), credita o leiloeiro, registra `PURCHASE`/`SALE` no extrato e emite o comprovante.
4. Após o commit, avisa em tempo real: `lot:ended` (sala e vitrine), `user:won` (vencedor) e `wallet:updated`.

**Idempotente**: rodar várias vezes ou em paralelo (inclusive em mais de uma instância da API) nunca cobra duas vezes — o `settledAt` é conferido sob a trava, o `SKIP LOCKED` evita execuções simultâneas no mesmo lote e o comprovante tem `lot_id` único.

**Comprovante**: link com código aleatório de 128 bits (`/comprovante/:shareCode`). Mostra o carro, o pseudônimo do vencedor, o valor, o número de lances e o **hash final da corrente**, tudo **assinado** com a mesma chave Ed25519 dos lances. Se o comprovante, o número de lances ou o histórico do lote forem alterados depois (inclusive apagando lances), `signatureValid` passa a ser `false`.

**Meus arremates**: para cada lote em que o licitante deu lance — `WINNING`, `OUTBID`, `AWAITING_SETTLEMENT` (encerrado liderando, aguardando o job), `WON` (com link do comprovante), `LOST` ou `CANCELLED`.

> **Limitação conhecida**: o saldo é um `INTEGER` em centavos. O total acumulado de vendas de um leiloeiro fica limitado a R$ 21.474.836,47; acima disso a liquidação falha (registrada no log) e o lote permanece "aguardando liquidação". Para produção real, a coluna seria migrada para `BIGINT`.

## Tempo real (Socket.IO)

O front conecta no mesmo endereço da API (`io(API_URL, { auth: { token } })`). Sem token, a conexão é anônima (vitrine e salas são públicas); com token inválido ou expirado a conexão é recusada (`connect_error: UNAUTHORIZED`), para o front pedir novo login.

| Sala         | Como entra                          | Eventos recebidos                                                           |
| ------------ | ----------------------------------- | --------------------------------------------------------------------------- |
| `lot:{id}`   | `emit('lot:join', { lotId })`       | `lot:bid` (lance, estado do lote, `extended`, `serverTime`), `lot:cancelled` |
| `showcase`   | `emit('showcase:join')`             | `showcase:update` (lance atual de cada card), `lot:cancelled`               |
| `user:{id}`  | automática ao conectar com token    | `user:outbid` (você foi superado), `user:won` (você arrematou), `user:lot-cancelled` (estorno), `wallet:updated` |

Ao encerrar, a sala do lote e a vitrine recebem `lot:ended` (`sold`, `winnerPseudonym`, `finalPriceCents`).

- Os eventos são emitidos **depois do commit** da transação: ninguém é avisado de um lance que foi desfeito.
- Eventos públicos só têm pseudônimos; os avisos pessoais vão apenas para a sala privada do usuário.
- "Você está ganhando / foi superado": o front compara o pseudônimo do lance recebido com o seu (`GET /lots/:id/my-status`); o líder anterior também recebe `user:outbid`.
- `serverTime` acompanha os eventos para a contagem regressiva usar o relógio do servidor, não o do navegador.
- Ao reconectar, o cliente deve entrar de novo nas salas e recarregar o estado pela API (eventos perdidos durante a queda não são reenviados).

## Histórico à prova de adulteração

Técnica: **corrente de hashes (hash chain) + assinatura digital Ed25519**.

- Cada lance guarda `sequence` (1, 2, 3…), `prevHash` (hash do lance anterior; o primeiro aponta para `000…0`), `hash` e `signature`.
- `hash = SHA-256("v1|lotId|sequence|pseudônimo|valorEmCentavos|dataISO|prevHash")`. Alterar qualquer campo muda o hash; remover ou inserir um lance quebra a ligação `prevHash` de todos os seguintes e a numeração.
- `signature` = assinatura Ed25519 do hash com uma **chave privada que fica fora do banco** (variável `BID_SIGNING_PRIVATE_KEY`). Alguém com acesso ao banco poderia recalcular todos os hashes, mas **não** consegue produzir assinaturas válidas sem a chave. A chave pública é divulgada para que qualquer um verifique.
- O id do licitante não entra no hash (privacidade). Para que trocar o dono de um lance direto no banco também seja detectado, a verificação no servidor recalcula o pseudônimo a partir do `bidder_id`.
- O lote guarda `lastBidHash` e `bidCount`, conferidos contra a corrente.

### Auditoria pública (sem login)

| Método | Rota                     | Descrição                                                                  |
| ------ | ------------------------ | -------------------------------------------------------------------------- |
| GET    | `/api/lots/:id/audit`    | Histórico completo (com `prevHash`, `hash`, `signature`) e o veredito      |
| GET    | `/api/audit/public-key`  | Chave pública Ed25519 (PEM e bruta em base64) e o formato exato dos hashes |

O servidor responde `verification: { intact, issues[] }`, onde cada problema indica o grupo de verificação, o lance e a descrição:

| Grupo      | O que confere                                                                                     | Detecta                                         |
| ---------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `chain`    | Sequência sem buracos, `prevHash` encadeado, hash recalculado = armazenado, assinatura válida     | Valor/data alterados, lance removido ou inserido, hashes recalculados sem a chave |
| `bidders`  | Pseudônimo recalculado a partir do `bidder_id`                                                     | Lance "transferido" para outro usuário          |
| `lotState` | Quantidade de lances, último hash, lance atual e líder do lote batem com o fim da corrente        | Último lance apagado, lote editado              |
| `rules`    | 1º lance ≥ inicial, demais ≥ anterior + incremento, ninguém cobre o próprio lance, horários dentro do período | Regras do lote alteradas depois dos lances      |
| `receipt`  | Assinatura do comprovante e coerência com o último lance                                          | Comprovante alterado; histórico de lote liquidado apagado |

Além do veredito do servidor, os dados devolvidos permitem que **qualquer pessoa verifique a corrente e as assinaturas por conta própria** só com a chave pública (a página de auditoria faz isso no navegador), sem precisar confiar no servidor. As checagens `bidders` e `rules` dependem de dados internos e são feitas apenas no servidor.

Os testes e2e simulam cada ataque direto no banco (via SQL) e conferem que a auditoria o aponta.

**Limitação**: num lote **ainda não liquidado**, apagar **todos** os lances e zerar o lote ao mesmo tempo deixaria uma corrente vazia "válida". Depois da liquidação isso é detectado, porque o comprovante assinado guarda o hash final e o número de lances. Uma garantia total para lotes em andamento exigiria publicar os hashes num local externo (fora do escopo).

## Privacidade

Licitantes aparecem como **"Licitante #A3F9C1"**: um HMAC-SHA256 de `lote:usuário` com o segredo `PSEUDONYM_SECRET`. É estável dentro do lote (dá para acompanhar a disputa) e **diferente entre lotes** (não dá para rastrear a mesma pessoa em leilões diferentes). Ids, nomes e e-mails nunca aparecem no histórico público. Com 6 dígitos hexadecimais há 16,7 milhões de combinações; uma colisão entre dois licitantes do mesmo lote é improvável, mas possível.

## Front-end

Next.js 16 (App Router, Cache Components) com Tailwind CSS 4. Visual com a paleta do documento do teste (azul-marinho, verde-limão, roxo e ciano).

| Biblioteca              | Uso                                                              |
| ----------------------- | ---------------------------------------------------------------- |
| TanStack Query          | Dados da API (cache, recarga após eventos em tempo real)         |
| socket.io-client        | Tempo real (uma conexão por aba, reentra nas salas ao reconectar) |
| react-hook-form + zod   | Formulários com as mesmas regras de validação da API             |

- **Sessão**: o JWT fica no `localStorage`, lido com `useSyncExternalStore` (sair em uma aba encerra a sessão nas outras). Se a API responder 401 (token expirado) ou o WebSocket recusar o token, a sessão é encerrada automaticamente. *Trade-off*: `localStorage` é acessível a scripts da página (risco de XSS); um cookie `httpOnly` seria mais seguro, mas front e API ficam em domínios diferentes no deploy, onde cookies de terceiros costumam ser bloqueados.
- **Rotas protegidas**: verificação no cliente (redireciona para o login com `?next=`, validado para impedir redirecionamento para outros sites); a API aplica as mesmas regras de acesso.
- A tela de login tem botões com as **contas de demonstração** do seed.

## Testes

Todos exigem o Postgres do docker-compose rodando e usam **bancos próprios** — os dados de desenvolvimento nunca são afetados.

| Camada | Ferramenta | Comando | Banco |
| ------ | ---------- | ------- | ----- |
| Back-end — unitários | Vitest | `cd backend && npm test` | — |
| Back-end — integração/API | Vitest + Supertest | `cd backend && npm run test:e2e` | `leilao_test` |
| Aplicação completa no navegador | Playwright | `cd frontend && npm run test:e2e` | `leilao_e2e` |

**Back-end (Vitest)**: regras de lance, saldo comprometido, anti-sniping, liquidação idempotente, auditoria (cada ataque simulado direto no banco via SQL), tempo real com cliente Socket.IO real e **concorrência determinística** — uma conexão separada segura a trava da linha enquanto lances simultâneos são disparados; removendo o `FOR UPDATE` do código, esses testes falham. Os testes se recusam a rodar em banco cujo nome não termine em `_test` (`TEST_DATABASE_URL` para outro servidor).

**Ponta a ponta (Playwright)**: sobe a API (porta 3101) e o front (porta 3100, build em `.next-e2e`) sozinho e prepara o banco `leilao_e2e` a cada execução (`npm run e2e:prepare` no back-end: migrations + seed + cache do catálogo de veículos, para não depender da NHTSA/Wikipedia). Cobre:

- cadastro, login, rotas protegidas e logout;
- vitrine (abas, busca, filtro) e atualização dos cards em tempo real;
- **dois licitantes em sessões separadas disputando o mesmo lote**: recusas com motivo (próprio lance, abaixo do mínimo, saldo insuficiente), depósito, lance válido e a tela do outro mudando para "Você foi superado!" sem recarregar;
- liberação do saldo comprometido ao vivo e "Meus arremates";
- painel do leiloeiro: criação de lote pelo catálogo, cancelamento refletido na vitrine de outro visitante e **cancelamento com lances**: motivo obrigatório e a tela do líder mostrando o cancelamento e o estorno sem recarregar;
- auditoria pública (servidor + navegador) e comprovante aberto por link sem login.

Use `npm run test:e2e:ui` para acompanhar os testes no modo visual do Playwright. Na primeira vez, instale o navegador com `npx playwright install chromium`.

## Comportamentos inesperados e limitações

Reunidos aqui para quem for avaliar; os detalhes estão nas seções de cada assunto.

- **Primeiro acesso lento (~50 s)**: a API está no plano gratuito do Render, que desliga o servidor após ~15 min sem uso. Enquanto ela acorda, a vitrine mostra o carregamento; o tempo real reconecta sozinho depois.
- **Lotes que terminam com a API dormindo** só são liquidados quando ela acorda (o job roda a cada 5 s com a API ligada). Até lá, "Meus arremates" e o painel mostram "aguardando liquidação".
- **Anti-sniping**: "estende o fim para +2 minutos" foi interpretado como **fim = horário do lance + 2 minutos** (e não "fim atual + 2 min"). Lances seguidos na reta final mantêm sempre 2 minutos de disputa após o último lance.
- **Catálogo de carros**: a NHTSA só cobre o mercado americano a partir de 1981 — modelos nacionais (Gol, Uno…) e anos antigos não existem lá. Os carros antigos do seed são dados de demonstração. As fotos vêm da Wikipedia e nem sempre são do ano exato; por isso o leiloeiro escolhe entre até 4 sugestões.
- **Valores em `INTEGER` (centavos)**: lances de até R$ 20.000.000,00 e total recebido por leiloeiro limitado a R$ 21.474.836,47. Em produção real a coluna iria para `BIGINT`.
- **Auditoria de lote em andamento**: apagar **todos** os lances e zerar o lote ao mesmo tempo, direto no banco, deixaria uma corrente vazia "válida" até a liquidação (depois dela, o comprovante assinado detecta).
- **Eventos perdidos**: se a conexão em tempo real cair, os eventos do intervalo não são reenviados; ao reconectar o front recarrega o estado pela API.
- **Pseudônimos**: 6 dígitos hexadecimais por lote — colisão entre dois licitantes do mesmo lote é improvável, mas possível.
- **Sessão em `localStorage`**: front e API estão em domínios diferentes (cookies de terceiros costumam ser bloqueados); o custo é a exposição a XSS.
- **Cancelamento**: lotes encerrados não podem ser cancelados (a liquidação é o desfecho deles); lotes com lances exigem motivo e devolvem o valor ao líder.
- **Dados de demonstração**: qualquer pessoa pode dar lances nos lotes do seed, então o estado em produção muda com o uso. Para restaurar, veja "Reiniciar a demonstração em produção" em [Deploy](#deploy).

## Onde e como usei IA

Usei o **Claude Code** (Anthropic) como par de programação durante todo o projeto, dentro do VS Code.

- **Como trabalhei**: dividi o projeto em etapas (modelagem do banco, autenticação, catálogo externo, lotes, carteira, lances, liquidação, tempo real, auditoria, front-end, testes, Docker, deploy). Em cada etapa a IA propunha e implementava; eu revisava o código, rodava a aplicação e os testes e fazia o commit. Nenhuma etapa avançava sem eu validar a anterior.
- **Decisões que tomei**: stack (Next.js, NestJS, PostgreSQL), Prisma como ORM, carros como itens do leilão, valores em centavos com o limite de R$ 21,4 milhões documentado, guardar cópia das imagens, interpretação do anti-sniping, regras do cancelamento com estorno (só com motivo), visual com a paleta do documento sem a logo da Verzel, e a hospedagem (Vercel, Render e Neon).
- **O que a IA fez**: código do back-end e do front-end, testes (Vitest e Playwright), Dockerfiles, `render.yaml`, este README, e investigação de erros com testes no navegador.
- **O que precisou ser corrigido ou revisado**:
  - o primeiro teste de concorrência passava **com ou sem** a trava do banco — foi refeito com uma conexão separada segurando a trava, e confirmado que falha quando o `FOR UPDATE` é removido;
  - o guard global de autenticação bloqueava mensagens do WebSocket;
  - erros de hidratação do React (o indicador de conexão ficava "desconectado") — a primeira hipótese da IA estava errada e foi descartada com teste antes da correção;
  - testes Playwright que dependiam da ordem de execução;
  - os lotes do seed venciam antes da avaliação, e a variável da API no deploy da Vercel estava sem o `/api` — ambos encontrados testando a produção no navegador.

