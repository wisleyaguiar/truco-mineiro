# Modo online: como configurar

O modo online usa **Supabase** (banco, login por e-mail) e uma **função na Vercel** (`/api`) que é a autoridade do jogo: embaralha, valida jogadas e joga pelos bots. Sem as variáveis abaixo, o site continua funcionando só no modo offline.

## 1. Projeto no Supabase
1. Em supabase.com, crie um projeto na região **South America (São Paulo)**.
2. Abra **SQL Editor → New query**, cole o conteúdo de `supabase/migrations/0001_init.sql` e clique em **Run**.
   - Isso cria as tabelas, as regras de segurança (RLS) e as funções.
   - Rode **uma vez só**; as próximas migrações virão em arquivos novos (`0002_…`).

## 2. E-mail de login (obrigatório para outras pessoas entrarem)
O e-mail padrão do Supabase **só envia para membros da equipe do projeto** e tem limite de poucas mensagens por hora. Para o público precisa de SMTP próprio.

1. Crie uma conta no **Resend** (resend.com), adicione e verifique um domínio seu (registros DNS que o Resend mostra).
2. No Resend, crie uma **API key**.
3. No Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Host `smtp.resend.com`, porta `465`, usuário `resend`, senha = a API key do Resend.
   - Remetente: um e-mail do seu domínio (ex.: `truco@seudominio.com.br`).
4. **Authentication → Emails → Templates → Magic Link**: troque o corpo por algo com o **link e o código**:
   ```html
   <h2>Entrar no Zap & Copeta</h2>
   <p><a href="{{ .ConfirmationURL }}">Clique aqui para entrar</a></p>
   <p>Ou digite este código no jogo: <b>{{ .Token }}</b></p>
   ```
   - O código resolve quando o link abre em outro navegador/app (comum no celular).

## 3. Endereços permitidos para o login
**Authentication → URL Configuration**:
- **Site URL:** `https://truco-mineiro-tau.vercel.app`
- **Redirect URLs** (adicione as três):
  - `https://truco-mineiro-tau.vercel.app/**`
  - `https://truco-mineiro-*-aguiar-web1.vercel.app/**` (previews dos PRs, ex.: `truco-mineiro-git-feat-fase3a-infra-aguiar-web1.vercel.app`)
  - `http://localhost:5173/**` (desenvolvimento)

## 4. Variáveis na Vercel
Em **Project → Settings → Environment Variables** (marque Production e Preview):

| Nome | Onde pegar | Observação |
|---|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL | usada pela função `/api` |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → **Secret key** | **secreta**: só no servidor |
| `VITE_SUPABASE_URL` | a mesma Project URL | usada pelo site (pública) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys → **Publishable key** | pública, pode ir no site |

Depois: **Deployments → ⋯ → Redeploy** (as variáveis `VITE_*` entram no build).

Recomendado: **Settings → Functions → Function Region → São Paulo (gru1)**, perto do banco.

Obs.: os previews dos PRs ficam protegidos pela Vercel (Vercel Authentication): só abre quem está logado na sua conta Vercel. A produção é pública.

> Nunca coloque a chave secreta em variável que comece com `VITE_` (essas vão para o navegador).

## 5. Desenvolvimento local
```bash
npm install
npm run dev:api      # API em memória, login de desenvolvimento (sem e-mail)
```
Em outro terminal:
```bash
cd apps/client && VITE_DEV_AUTH=1 npx vite
```
Abra http://localhost:5173 → **Jogar online** → qualquer e-mail entra direto.

Para usar o Supabase de verdade localmente, exporte `SUPABASE_URL` e `SUPABASE_SECRET_KEY` antes do `npm run dev:api` e crie `apps/client/.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (sem `VITE_DEV_AUTH`).

## Segurança (resumo)
- O estado completo da partida (com as cartas de todos) fica em `match_states`, que **nenhum cliente consegue ler** (RLS + permissões revogadas). Tudo passa pela API, que devolve só a visão de cada jogador.
- As cartas são embaralhadas no servidor com aleatoriedade criptográfica.
- As funções que gravam partidas e estatísticas só podem ser chamadas com a chave secreta.
- Os testes em `packages/server/test/sql.test.ts` conferem essas regras num Postgres local (PGlite).
