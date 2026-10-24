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

Lotes criados (datas relativas ao momento em que o seed roda): 3 ao vivo (encerram em 1, 2 e 7 dias), 1 agendado (começa em 1 dia) e 1 já encerrado sem lances. Rodar `npm run db:seed` de novo restaura esse estado. Em produção o seed só roda com `SEED_ALLOW_RESET=true`.

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

## Testes

```bash
cd backend
npm test           # testes unitários
npm run test:e2e   # testes end-to-end (requer o Postgres do docker-compose rodando)
```

Os testes e2e usam um banco separado, `leilao_test`, criado e migrado automaticamente na primeira execução — os dados de desenvolvimento (seed) não são afetados. Por segurança, os testes se recusam a rodar em qualquer banco cujo nome não termine em `_test`. Para usar outro servidor, defina `TEST_DATABASE_URL`.
