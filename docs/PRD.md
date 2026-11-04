# PRD: Truco Mineiro 3D Online ("Zap & Copeta")

**Versão do Documento:** 1.0

**Status:** Pronto para Arquitetura & Desenvolvimento

**Plataformas Alvo:** Web (WebGL / Three.js / PlayCanvas ou Unity WebGL) e Mobile/Desktop (Cross-platform)

---

## 1. Visão Geral do Produto (Product Overview)

O objetivo é desenvolver um jogo online imersivo em **3D de Truco Mineiro (Manilha Velha)**, focado na autenticidade cultural, fluidez de jogabilidade em tempo real e competitividade. O jogo deve reproduzir a atmosfera real de uma mesa de bar/fazenda mineira, incluindo física nas cartas, batidas na mesa, sinais entre parceiros, áudio espacial com gírias típicas e sistema inteligente de preenchimento de vagas com Bots (IA).

---

## 2. Objetivos de Negócio e Escopo Core

1. **Imersão 3D Cultural:** Entregar uma experiência audiovisual autêntica, com avatares expressivos, animações de arremesso de carta e gritos clássicos de truco.
2. **Liquidez de Partida Instantânea (Zero Fila Vazia):** Garantir que nenhuma partida deixe de acontecer por falta de jogadores humanos, preenchendo automaticamente os assentos vazios (de 1 a 3 vagas) com agentes de IA calibrados.
3. **Retenção Competitiva:** Sistema robusto de Ranking de Duplas (ELO/MMR) e motor de Campeonatos (Chaves Eliminatórias / Mata-mata).

---

## 3. Motor de Regras do Jogo (Core Game Engine)

O servidor de jogo deve ser **100% autoritativo** (anti-trapaça: os clientes apenas recebem as cartas da sua própria mão e enviam intenções de jogada).

### 3.1. Baralho e Hierarquia (Manilha Velha)

* **Baralho:** 40 cartas (retiram-se os 8, 9, 10 e Coringas).
* **Manilhas Fixas (em ordem decrescente de força):**
1. `4 de Paus` (**Zap / Gato**)
2. `7 de Copas` (**Copeta / Copas**)
3. `Ás de Espadas` (**Espadilha**)
4. `7 de Ouros` (**Pica-fumo / Moleque**)


* **Cartas Comuns (em ordem decrescente, naipes têm mesmo valor):**
* `3` > `2` > `Ás (Ouros, Copas, Paus)` > `K (Rei)` > `J (Valete)` > `Q (Dama)` > `7 (Paus, Espadas)` > `6` > `5` > `4 (Ouros, Copas, Espadas)`.



### 3.2. Dinâmica de Mãos e Rodadas (Vazas)

* **Estrutura:** Disputado em duplas (Dupla A: Posições 1 e 3 na mesa vs. Dupla B: Posições 2 e 4).
* **Pontuação Alvo:** Vence a queda (partida) a dupla que atingir **12 pontos** (tentos).
* **Fluxo da Mão:** Cada jogador recebe 3 cartas. A mão é disputada em melhor de 3 vazas (rodadas).
* **Regras de Desempate (Canga / Empache):**
* Empate na 1ª rodada: Quem vencer a 2ª rodada leva a mão.
* Empate na 2ª rodada: Vence quem ganhou a 1ª rodada.
* Empate na 3ª rodada: Vence quem ganhou a 1ª rodada.
* Empate nas 3 rodadas: Ninguém pontua, passa o baralho para a próxima mão.


* **Jogar Carta Coberta ("No Escuro"):** A partir da 2ª rodada, o jogador pode optar por descartar a carta virada para baixo (não soma força, serve para blefe ou esconder jogo).

### 3.3. Escala de Apostas (Gritos)

* **Valor inicial da mão:** **2 pontos**.
* **Escalada de chamadas:**
* Pedido de **Truco!** $\rightarrow$ Sobe para **4 pontos**.
* Resposta **Seis!** $\rightarrow$ Sobe para **6 pontos**.
* Resposta **Nove! (ou Oito!)** $\rightarrow$ Sobe para **8 ou 10 pontos** *(configurável na regra padrão Mineira: 2 $\rightarrow$ 4 $\rightarrow$ 6 $\rightarrow$ 10 $\rightarrow$ 12)*.
* Resposta **Doze!** $\rightarrow$ Sobe para **12 pontos** (vale a partida).


* **Opções da dupla desafiada:**
1. *Correr (Fugir):* A dupla adversária ganha os pontos vigentes antes do aumento.
2. *Aceitar (Mandar descer):* A mão passa a valer o novo patamar.
3. *Aumentar (Retrucar):* Sobe imediatamente para o próximo nível de pontuação.


* *Regra de Alternância:* A mesma dupla não pode aumentar a aposta duas vezes seguidas.

### 3.4. Mão de 10 (e Mão de Ferro)

* **Mão de 10 (uma dupla com 10 pontos):**
* Antes da 1ª carta ser jogada, os parceiros da dupla que tem 10 pontos visualizam as cartas um do outro na tela (UI dedicada de "Avaliação da Mão").
* Decidem se jogam (valendo 2 pontos iniciais) ou correm (adversário ganha 2 pontos).
* **Proibição:** É proibido pedir Truco na Mão de 10. Se alguém pedir truco por engano (ou botão bloqueado/penalidade), perde a mão automaticamente.


* **Mão de Ferro (10 a 10):**
* Todos jogam no escuro (ou sem poder pedir truco, quem levar 2 vazas vence a partida). *Configurável nas opções de sala: Aberta sem truco ou Cega.*



---

## 4. Modos de Jogo, Matchmaking e Sistema de IA (Bots)

### 4.1. Modo Individual (Singleplayer / Treino)

* O jogador entra direto na mesa.
* Seu parceiro é controlado por uma IA (`Bot Parceiro`) e os dois oponentes são IAs (`Bots Adversários`).
* Ideal para partidas rápidas, treino de sinais e jogo com baixa latência.

### 4.2. Modo Multiplayer & Preenchimento Híbrido (Drop-in / Drop-out)

* **Salas de 4 Jogadores:** O lobby busca fechar 4 jogadores humanos.
* **Regra de Timeout e Auto-fill com IA:**
* Se uma sessão for criada por 1, 2 ou 3 jogadores humanos e o timer do lobby expirar (ex: 15 segundos) ou o criador clicar em "Iniciar Agora", **os assentos restantes são preenchidos instantaneamente por jogadores IA**.
* *Cenário 1 (1 Humano):* Humano + 1 IA vs. 2 IAs.
* *Cenário 2 (2 Humanos - Dupla Fechada):* Humano A + Humano B vs. 2 IAs.
* *Cenário 3 (2 Humanos - Adversários):* (Humano A + IA) vs. (Humano B + IA).
* *Cenário 4 (3 Humanos):* (Humano A + Humano B) vs. (Humano C + IA).


* **Reconexão e Substituição (Takeover):** Se um jogador humano cair durante a partida (disconnect > 20s), um Bot assume temporariamente sua mão para não travar a mesa até que ele reconecte.

### 4.3. Comportamento da Inteligência Artificial (Heurística + Personalidade)

A IA não deve apenas calcular probabilidades matemáticas; ela deve simular o comportamento humano no Truco Mineiro:

1. **Leitura de Mesa:** Avaliar força da mão (ex: ter Zap + carta alta = mão forte; ter cartas baixas = possibilidade de blefe).
2. **Sistema de Sinais:** O Bot parceiro **envia sinais visuais** (piscada, bico, mexer no ombro) para o jogador humano e **interpreta os sinais** que o jogador humano envia para ele através da roda de comandos.
3. **Perfis de Personalidade de Bot:**
* *Bot "Zé do Blefe":* Pede truco com três cartas baixas (4, 5, 6) na última vaza.
* *Bot "Mineiro Desconfiado":* Só aumenta aposta com manilha garantida, mas esconde o Zap na primeira rodada ("cama").



---

## 5. Experiência 3D, Áudio e Imersão Cultural

### 5.1. Ambiente e Câmera 3D

* **Cenários 3D:**
1. *Boteco Raiz:* Mesa de madeira redonda/quadrada com toalha verde de feltro ou madeira marcada, copos americanos, garrafas, iluminação quente.
2. *Varanda da Fazenda:* Ambiente rústico diurno/noturno com som ambiente de natureza e viola ao fundo.
3. *Arena de Campeonato:* Salão iluminado com troféus e placar de LED estilizado.


* **Câmera:** Primeira pessoa (visão dos próprios braços/cartas e visão frontal do parceiro e laterais dos adversários). Efeito de *Camera Shake* (tremor de tela) quando um jogador dá um tapa forte na mesa ao pedir Truco ou bater o Zap.

### 5.2. Sinais Secretos (Mecânica de Jogo)

Uma roda de ações rápidas (Action Wheel / Atalhos de Teclado) permite ao jogador fazer animações faciais no seu avatar 3D. O perigo real existe: se você fizer o sinal no momento em que o avatar do adversário estiver olhando para você, ele pode interceptar!

* **Sinais Clássicos:**
* *Zap (4 de Paus):* Piscar um olho ou levantar as sobrancelhas.
* *Copeta (7 de Copas):* Fazer bico com os lábios.
* *Espadilha (Ás de Espadas):* Mostrar a ponta da língua ou morder o lábio.
* *Pica-fumo (7 de Ouros):* Encolher um ombro ou inclinar a cabeça.
* *Três (3):* Três batidinhas sutis dos dedos nas cartas.
* *Cego (Nada na mão):* Fechar os dois olhos rapidamente ("tô cego").



### 5.3. Engenharia de Som e Falas Típicas (Voice Lines & SFX)

O áudio é um pilar central do produto. Deve haver variações de vozes masculinas e femininas com sotaque mineiro autêntico.

* **Falas de Pedido de Truco / Aumentos:**
* *"Truco, ladrão!"*
* *"Truco, marreco! Desce ou corre!"*
* *"Ladrão que rouba ladrão... SEIS, papai!"*
* *"Meio quilo! Chora na cama que é lugar quente!"*
* *"DOZE! Aqui tem coragem, uai!"*


* **Falas de Jogadas Específicas:**
* Ao bater o Zap na mesa: *"Toma esse Gato na testa!"*, *"Aqui o sistema é bruto!"*, *"Zap neles!"*
* Ao empatar (Cangar): *"Cangou! Mostra a maior!"*, *"Amarrou o jogo!"*
* Ao correr: *"Vou deixar procêis dessa vez..."*, *"Matou cachorro a grito, hein?"*
* Na Mão de 10: *"Passa as carta aí, parceiro, vamo ver se nóis tem jogo."*


* **Efeitos Sonoros (SFX):**
* Estalo seco da carta deslizando ou batendo na madeira.
* Estrondo de mão batendo na mesa no grito de Truco (com variação de intensidade).
* Som dos tentos (feijões, palitos de fósforo ou fichas de metal) sendo arrastados no placar da mesa.



---

## 6. Sistema de Ranking de Duplas e Campeonatos

### 6.1. Entidade "Dupla Oficial" (Team Roster)

* Dois jogadores humanos podem registrar uma **Dupla Fixa** (com Nome da Dupla, Brasão/Emblema e Histórico conjunto).
* Também existe o **Ranking Individual** (para quem joga com parceiros aleatórios ou com IA), mas o **Ranking de Duplas** é a vitrine competitiva principal.

### 6.2. Ranking de Vitórias e MMR (Matchmaking Rating)

* **Métricas Armazenadas por Dupla:**
* Total de Partidas Disputadas (`matches_played`)
* Vitórias (`wins`) e Derrotas (`losses`)
* Taxa de Vitória (`win_rate %`)
* Vitórias de "Capote" (12 a 0)
* Pontuação de Ranking (ELO / Pontos de Liga)
* Sequência de Vitórias Atual (`win_streak`)


* **Divisões de Liga:**
1. *Liga Café com Leite* (Iniciante)
2. *Liga Pão de Queijo* (Bronze/Prata)
3. *Liga Cachaça da Boa* (Ouro/Platina)
4. *Liga Diamante das Gerais* (Mestre/Elite)


* *Regra de Integridade do Ranking:* Partidas contra 2 Bots contam para estatísticas casuais e XP, mas o **Ranking Oficial de Duplas** pontua apenas em confrontos onde a dupla adversária também possui pelo menos 1 ou 2 jogadores humanos (ou em chaves oficiais).

### 6.3. Modo Campeonato (Tournaments)

Sistema automatizado e agendado (ou sob demanda) de torneios mata-mata.

* **Formatos de Chaveamento:** 8, 16 ou 32 duplas (Eliminação Simples ou Melhor de 3 quedas na Final).
* **Inscrição:** Duplas registradas se inscrevem antes do horário de início.
* **Preenchimento de Chave:** Se um torneio de 8 duplas tiver 6 duplas humanas inscritas no fechamento do check-in, as 2 vagas restantes podem ser preenchidas por "Duplas Lendárias de IA" (Bots de nível difícil) ou dar *Bye* (avanço automático), conforme configuração do torneio.
* **Sala de Espera e Spectate:** Duplas que terminam sua partida mais cedo podem assistir (modo espectador 3D atrasado em 15s para evitar cola) às outras mesas do campeonato.
* **Premiação Virtual:** Troféu 3D exibido na mesa da dupla campeã, insígnias exclusivas, skins de baralho e pontos extras no Ranking Geral.

---

## 7. Arquitetura Técnica Sugerida e Modelo de Dados

### 7.1. Stack Tecnológica Recomendada

* **Frontend / Motor 3D:**
* **Opção Web-First (Navegador/PWA/Desktop via Electron):** *Three.js* (ou *Babylon.js*) + *React/Vue* para o HUD/UI (Menus, Placar, Brackets de Campeonato) + *GSAP* para animações de cartas.
* **Opção Game Engine Nativa:** *Unity* ou *Godot* exportando para WebGL, Android, iOS e PC.


* **Backend & Comunicação Real-Time:**
* **Servidor de Jogo (WebSockets):** *Node.js* (com *Socket.io* ou *Colyseus* - framework especializado em jogos multiplayer de turno/estado em Node.js).
* **API REST & Painel Administrativo:** *Laravel* ou *Node.js (Fastify/NestJS)* para gestão de contas, autenticação, criação de campeonatos, histórico e leaderboards.


* **Banco de Dados:**
* **PostgreSQL / MySQL:** Dados persistentes (Usuários, Duplas, Histórico de Partidas, Campeonatos).
* **Redis:** Estado efêmero das salas em andamento (cartas na mão, turno atual, timer de jogada de 15s) e Cache do Leaderboard em tempo real (Redis Sorted Sets).



### 7.2. Esquema Resumido do Banco de Dados (Principais Tabelas)

```sql
-- Usuários
users (id, name, nickname, avatar_config_json, solo_elo, created_at)

-- Duplas Registradas
teams (id, name, tag, player1_id, player2_id, elo_rating, wins, losses, capotes_count, win_streak, created_at)

-- Sessões de Jogo (Partidas)
matches (id, mode [solo, duo_ranked, tournament], tournament_id, status, score_team_a, score_team_b, winner_team_slot, started_at, finished_at)

-- Participantes da Partida (Suporta Humanos e Bots)
match_participants (id, match_id, seat_position [1..4], team_slot [A, B], user_id [NULL se for IA], is_bot, bot_personality)

-- Campeonatos
tournaments (id, title, max_teams [8, 16, 32], status [open, in_progress, finished], start_time, winner_team_id)

-- Chaves do Campeonato (Brackets)
tournament_matches (id, tournament_id, round_number, bracket_position, team_a_id, team_b_id, match_id, winner_team_id)

```

---

## 8. Interface do Usuário (HUD & UX)

1. **Mesa Central 3D:** Ocupa 100% da viewport durante a partida.
2. **HUD Inferior (Jogador Local):**
* As 3 cartas em formato de leque 3D interativo (hover levanta a carta; clique/arraste joga na mesa; botão secundário joga "coberta").
* Botão de destaque **"TRUCO!"** (muda dinamicamente para **"SEIS!"**, **"DEZ!"**, **"DOZE!"** quando aplicável).
* Botão discreto de **"Sinais"** (abre menu radial com os atalhos de sinais faciais).


3. **HUD Superior (Placar Mineiro):**
* Exibição clara dos Tentos (0 a 12) da Dupla A vs. Dupla B.
* Indicador visual das 3 rodadas da mão atual (Ex: 3 bolinhas que ficam Verdes, Vermelhas ou Amarelas em caso de empate/canga).
* Valor atual da mão em disputa (2, 4, 6, 10 ou 12 tentos).


4. **Identificação de Bots:** Quando um assento é ocupado por IA, exibe uma tag clara como `[IA] Tião do Zap` ou `[IA] Chico Mineiro` com seu próprio avatar 3D.

---

## 9. Roadmap de Desenvolvimento (Fases / Releases)

* **Fase 1 — MVP Core & Motor de Regras (Mês 1-2):**
* Implementação do servidor autoritativo com todas as regras do Truco Mineiro (Manilha Velha, Canga, Mão de 10).
* Lógica de Bots (IA) capaz de jogar sozinha e preencher vagas de 1 a 3 assentos.
* Mesa 3D básica funcional com distribuição e arremesso de cartas.


* **Fase 2 — Imersão Audiovisual & Sinais (Mês 3):**
* Inclusão do pacote de vozes mineiras, efeitos sonoros de batida na mesa e *camera shake*.
* Avatares 3D com animações de sinais (piscada, bico, língua, ombro).


* **Fase 3 — Sistema de Duplas & Ranking (Mês 4):**
* Criação de Duplas Fixas, cálculo de MMR/ELO, tela de Leaderboard Geral e histórico de partidas.


* **Fase 4 — Motor de Campeonatos (Mês 5):**
* Sistema de inscrição de duplas, geração automática de chaves (Brackets), transição automática das duplas vencedoras para a próxima fase e sala de premiação.



---

### Próximos Passos Sugeridos

Se quiser avançar para a parte prática, posso detalhar qualquer um destes módulos agora mesmo:

1. **Máquina de Estados (State Machine) em código (Node.js/TypeScript)** com toda a lógica de validação de rodadas, cangas e gritos do Truco Mineiro.
2. **Estrutura do banco de dados completa (Migrations)** para o sistema de Duplas e Chaves de Campeonato.
3. **Protótipo inicial da cena 3D (Three.js)** com a mesa, câmera e física de jogar as cartas.