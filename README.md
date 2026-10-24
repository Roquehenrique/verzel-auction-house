# Casa de Leilões de Carros

Casa de leilões online de carros: leiloeiros criam lotes a partir de veículos buscados em uma API pública e licitantes disputam cada lote com lances ao vivo.

> Documento em construção: será completado ao longo do desenvolvimento.

## Stack

| Camada    | Tecnologia                          |
| --------- | ----------------------------------- |
| Front-end | Next.js 16 (React, App Router), Tailwind CSS |
| Back-end  | NestJS 12 (Node.js, TypeScript)     |
| Banco     | PostgreSQL 17 + Prisma ORM          |

## Estrutura

```
.
├── backend/            # API NestJS (porta 3001, prefixo /api)
├── frontend/           # App Next.js (porta 3000)
└── docker-compose.yml  # PostgreSQL local
```

## Rodando localmente

Pré-requisitos: Node.js 20.11+ e Docker (Docker Desktop ou Colima).

```bash
# 1. Banco de dados
docker compose up -d

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

Lotes criados (datas relativas ao momento em que o seed roda):

| Lote                     | Situação                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| Porsche 911 Carrera 2025 | Ao vivo (7 dias) — Ana ganhando com R$ 680.000                           |
| Ford Mustang 1965        | Ao vivo (2 dias) — Bruno ganhando com R$ 190.000                         |
| Chevrolet Opala 1978     | Ao vivo (1 dia) — sem lances                                             |
| Toyota GR Supra 2020     | Agendado (começa em 1 dia)                                               |
| Volkswagen Fusca 1966    | Encerrado sem lances (liquidado pelo job ao subir a API)                 |
| Fiat Uno 2011            | **Arrematado pela Ana** por R$ 32.000, com comprovante (link impresso pelo seed) |

Os lances e a liquidação do seed passam pelos mesmos serviços da aplicação (mesmas regras, hash, assinatura e comprovante). Rodar `npm run db:seed` de novo restaura esse estado. Em produção o seed só roda com `SEED_ALLOW_RESET=true`.

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
| POST   | `/api/lots/:id/cancel`    | leiloeiro dono  | Cancela um lote que ainda não recebeu lances                  |

**Regras**

- **Status calculado pelo relógio do servidor**: agendado (`agora < início`), ao vivo (`início ≤ agora < fim`), encerrado (`agora ≥ fim`). O fim é exclusivo: no instante exato do fim o lote já está encerrado. Lotes cancelados não aparecem na vitrine, mas continuam acessíveis pelo id (comprovantes e auditoria).
- **Criação**: o front envia `makeId`, `modelId` e `year`; o servidor confere no catálogo e grava os nomes oficiais — não é possível criar lote de um carro que não veio da API. A imagem precisa ser uma das sugeridas (Wikimedia); uma cópia é baixada e guardada no banco (`lot_images`). Se o download falhar, o lote é criado mesmo assim e `/image` redireciona para a URL original.
- **Agenda**: início agora ou em até 90 dias (1 min de tolerância para "começar agora"); duração de 5 minutos a 30 dias.
- **Valores** em centavos, de R$ 1,00 a R$ 20.000.000,00 (folga abaixo do limite do `INTEGER` para os lances seguintes).
- **Cancelamento**: só o dono, só lotes não encerrados e **sem lances**. A linha do lote é travada (`SELECT ... FOR UPDATE`) antes da verificação, então um lance e um cancelamento simultâneos nunca resultam em lote cancelado com lance. Um teste e2e segura a trava numa conexão separada para provar esse comportamento.
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
| `user:{id}`  | automática ao conectar com token    | `user:outbid` (você foi superado), `user:won` (você arrematou), `wallet:updated` |

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

## Testes

```bash
cd backend
npm test           # testes unitários
npm run test:e2e   # testes end-to-end (requer o Postgres do docker-compose rodando)
```

Os testes e2e usam um banco separado, `leilao_test`, criado e migrado automaticamente na primeira execução — os dados de desenvolvimento (seed) não são afetados. Por segurança, os testes se recusam a rodar em qualquer banco cujo nome não termine em `_test`. Para usar outro servidor, defina `TEST_DATABASE_URL`.
