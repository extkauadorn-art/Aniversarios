# Birthday Hub — Line Haul

Aplicação independente para cadastrar colaboradores, identificar aniversários, enviar mensagens e manter um histórico auditável. A planilha é **somente uma fonte de importação**; após a confirmação, o PostgreSQL é a fonte oficial.

## Stack

- Next.js 15 (App Router), React 19, TypeScript e Tailwind CSS;
- PostgreSQL e Prisma ORM;
- Auth.js com credenciais e senha protegida por bcrypt;
- Resend, abstraído por `EmailProvider` (com modo seguro de simulação);
- Vercel Cron ou qualquer scheduler HTTP autenticado;
- Vitest, Docker e Docker Compose.

## Funcionalidades

- dashboard responsivo com indicadores, aniversariantes de hoje e próximos aniversários;
- CRUD de colaboradores, desativação lógica, pesquisa e validação no servidor;
- calendário mensal, envio manual (manual pode ser repetido) e histórico;
- envio automático idempotente: uma chave única `colaborador:ano` impede duplicidade automática mesmo com chamadas concorrentes;
- templates com `{{nome}}`, `{{area}}`, `{{equipe}}` e `{{dataAniversario}}`;
- política configurável para 29/02: 28/02, 01/03 ou somente ano bissexto;
- importação Excel/CSV com múltiplas abas, descoberta de cabeçalhos e prévia;
- logs de login, importação e alterações administrativas;
- API validada, consultas parametrizadas pelo Prisma, rotas protegidas e segredos no ambiente.

> A planilha “Copia de Lista Colaboradores Line Haul” não estava presente no repositório recebido. O importador foi construído e testado com arquivos equivalentes gerados em teste; basta selecioná-la na tela **Importar colaboradores**. Ele reconhece Nome/Colaborador/Funcionário, Aniversário/Nascimento, Email/E-mail, Contato corporativo/Telefone, Área/Setor, Equipe/Time e Cargo/Função.

## Desenvolvimento local

Requisitos: Node.js 22+, npm e PostgreSQL 16+ (ou Docker).

```bash
cp .env.example .env
docker compose up -d db
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Acesse `http://localhost:3000`. Por padrão o seed cria `admin@linehaul.local` / `Admin123!`. Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` **antes do seed** em ambientes reais e troque a credencial padrão imediatamente.

## Variáveis de ambiente

| Variável | Finalidade |
|---|---|
| `DATABASE_URL` | conexão PostgreSQL (Neon, Supabase ou local) |
| `DIRECT_URL` | conexão direta usada pelas migrations do Prisma |
| `AUTH_SECRET` | segredo aleatório de pelo menos 32 caracteres para sessões |
| `AUTH_URL` | URL pública, por exemplo `https://app.exemplo.com` |
| `RESEND_API_KEY` | chave do Resend; nunca exponha no cliente |
| `CRON_SECRET` | bearer token exclusivo para o endpoint do cron |
| `EMAIL_DRY_RUN` | `true` registra no console sem entregar; use `false` em produção |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | opcionais, consumidas apenas pelo seed |

Gere segredos com `openssl rand -base64 32`. Configure no painel do provedor, e não faça commit do `.env`.

### Supabase e Vercel

Em produção com Supabase, defina `DATABASE_URL` com a URL do **transaction-mode
pooler**. O Prisma Client utiliza essa conexão no funcionamento normal da aplicação.
Defina `DIRECT_URL` com a URL do **session-mode pooler**, utilizada pelo Prisma em
operações que precisam de uma sessão estável, como migrations.

Configure ambas as variáveis nos ambientes aplicáveis da Vercel (Production, Preview
e Development). Copie os valores fornecidos pelo painel do Supabase e mantenha usuário,
senha, host e chaves apenas nos gerenciadores de variáveis de ambiente. Nunca versione
uma URL ou credencial real do Supabase.

## Banco, migration e seed

```bash
npx prisma generate
npx prisma migrate deploy       # produção
npx prisma migrate dev          # desenvolvimento
npx prisma db seed
```

`Employee` mantém o cadastro; `BirthdaySend` é o histórico; `Settings` guarda a configuração singleton e `AuditLog` registra ações. E-mail de colaborador é único. `idempotencyKey`, também única, existe apenas em envios automáticos; assim o mesmo aniversário nunca é enviado automaticamente duas vezes, enquanto o administrador ainda pode reenviar manualmente.

## Configurar e-mail

1. Valide um domínio no Resend.
2. Crie `RESEND_API_KEY` e defina `EMAIL_DRY_RUN=false`.
3. Em **Configurações**, informe um remetente pertencente ao domínio validado e o Reply-To.
4. Cadastre um colaborador de teste e use **Enviar agora**. Confirme o status em **Histórico**.

O contrato `EmailProvider` permite trocar o Resend sem alterar o fluxo de aniversário. Durante o desenvolvimento, mantenha `EMAIL_DRY_RUN=true`: o provedor de console simula sucesso sem mandar mensagens reais.

## Cron em produção

O endpoint é `GET /api/cron/birthdays` e exige:

```http
Authorization: Bearer SEU_CRON_SECRET
```

Teste localmente:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/birthdays
```

O `vercel.json` agenda diariamente às 12:00 UTC. Ajuste a expressão para que corresponda ao horário configurado e ao fuso da empresa (o valor visual de horário documenta a política; o disparo efetivo é controlado pelo scheduler). Ative **Envio automático** nas configurações. Neon/Supabase servem como PostgreSQL externo. Em outro provedor, configure uma chamada HTTP diária com o mesmo header.

## Importar a planilha

1. Entre no sistema e abra **Importar colaboradores**.
2. Selecione `.xlsx`, `.xls` ou `.csv` (CSV é tratado como uma aba).
3. Confira a prévia: total, válidos, duplicados, sem e-mail, sem nascimento e erros.
4. Clique **Importar válidos**.

Todas as abas são lidas. Quando não houver coluna Equipe, o nome da aba vira a equipe. Duplicados são comparados pelo e-mail normalizado. Linhas sem data/nome ou inválidas não são gravadas; colaboradores sem e-mail podem ser mantidos via cadastro administrativo, mas nunca recebem envio automático.

## API

Todas as rotas, exceto autenticação e cron, requerem sessão administrativa.

| Método | Rota | Uso |
|---|---|---|
| GET / POST | `/api/employees` | listar/criar colaboradores |
| PUT / DELETE | `/api/employees/:id` | editar/desativar |
| GET | `/api/birthdays?month=9` | aniversariantes do mês |
| GET | `/api/birthdays/today` | aniversariantes de hoje |
| POST | `/api/birthdays/:id/send` | envio manual |
| GET | `/api/history?status=ERRO` | histórico |
| POST | `/api/import` | prévia (`file`) ou gravação (`confirm=true`) |
| GET / PUT | `/api/settings` | consultar/editar configurações |
| GET | `/api/cron/birthdays` | execução diária autenticada |

## Testes e verificação

```bash
npm test
npm run build
```

Os testes cobrem dia/mês, e-mail, templates, anos bissextos e importação multiaba/aliases. A restrição única no PostgreSQL é a garantia final contra duplicidade concorrente. Para validar o fluxo integrado: rode migration e seed, mantenha dry-run ligado, importe uma planilha, confira o colaborador, envie manualmente, confira o histórico e execute o cron duas vezes; a segunda chamada devolve o mesmo registro automático.

## Docker completo

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed
```

## Segurança e operação

- bcrypt para senha e JWT assinado para sessão;
- Zod no backend, Prisma parametrizado (proteção contra SQL injection) e React escapando conteúdo (XSS);
- middleware protege páginas/APIs administrativas;
- credenciais somente em variáveis de ambiente;
- erros de e-mail persistem sem chave/API ou stack trace;
- desativação lógica preserva histórico.

Para exposição pública de alto volume, recomenda-se adicionar um rate limiter distribuído (por exemplo, Upstash) na borda; o login já evita revelar se o usuário existe. Faça backup do PostgreSQL e monitore registros `ERRO`.

## Limitações conhecidas

- lembrete administrativo está modelado e configurável, mas o envio adicional ao administrador ainda não é executado;
- a expressão cron é configurada pelo provedor, não alterada dinamicamente pelo campo de horário;
- filtros avançados existem na API; a interface atual oferece pesquisa principal e seleção mensal;
- a planilha original não pôde ser inspecionada porque não foi incluída no workspace.
