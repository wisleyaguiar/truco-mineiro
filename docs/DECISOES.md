# Decisões de regra e de escopo (MVP)

O PRD (`docs/PRD.md`) tinha pontos ambíguos ou contraditórios. Abaixo está o que foi decidido para o MVP. Tudo marcado como "configurável" fica em `MatchConfig` (`packages/engine/src/types.ts`).

## Regras

| Tema | Decisão | Origem |
|---|---|---|
| Escala de apostas | 2 → 4 (Truco) → 6 (Seis) → 10 (Dez) → 12 (Doze). Configurável (`betLadder`). | Escolha do dono do produto. O PRD misturava "Nove (ou Oito) → 8 ou 10". |
| Nome do 3º grito | "DEZ!" (bate com o valor 10). | O PRD usava "Nove!" na fala e "DEZ!" no botão. |
| Mão de Ferro (10 a 10) | Cega: ninguém vê as próprias cartas, sem truco, quem fizer 2 vazas fecha a partida. Configurável (`maoDeFerro: 'cega' \| 'aberta'`). | Escolha do dono do produto. |
| Mão de 10 | Dupla com 10 vê as 6 cartas e decide. **Jogar vale 4**, correr dá 2 ao adversário. Truco bloqueado para todos; se pedido (via motor), quem pediu perde a mão e o adversário leva o valor vigente (4). Configurável (`maoDe10Value`). | PRD 3.4, com valor alterado pelo dono do produto. |
| Por que 4 e não 2 | O PRD dizia 2, mas aí **correr nunca compensa**: perde 2 de qualquer jeito. Valendo 4, correr (perder 2) passa a ser uma escolha real contra jogar e arriscar perder 4. | Decidido: valendo 4. |
| Carta coberta | Só da 2ª vaza em diante. Vale 0 (perde para qualquer carta aberta). Na Mão de Ferro cega não existe (as cartas são reveladas ao jogar). | PRD 3.2 + decisão técnica. |
| Canga (empate) | Exatamente como o PRD 3.2. Quem puxa a vaza seguinte após uma canga é quem jogou primeiro a maior carta. | PRD + decisão técnica (o PRD não dizia). |
| Quem responde ao truco | Qualquer jogador da dupla desafiada. Se a dupla é você + bot, **você** decide. | Decisão técnica. |
| Quem pode pedir truco | Só na sua vez de jogar. | Prática comum; o PRD não dizia. |
| Primeiro a jogar | O jogador seguinte ao dealer; o dealer gira a cada mão. Ordem anti-horária. | Prática comum. |

## Sinais secretos (Fase 2)

| Tema | Decisão |
|---|---|
| Sinais | 😉 Zap (piscar um olho) · 😗 Copeta (bico) · 😛 Espadilha (língua) · 🤷 Pica-fumo (ombro + cabeça) · ✋ Três (3 batidinhas nas cartas) · 😑 Cego (fecha os dois olhos = "não tenho nada"). |
| Significado | Um sinal é uma **afirmação** ("tenho o Zap"). Pode ser blefe: quem recebe acredita. |
| Quem recebe | O parceiro **sempre** recebe. Adversário que estava **olhando para quem sinalizou** no instante do sinal intercepta e passa a "saber" a carta. |
| Olhar dos bots | Cada bot alterna o olhar a cada 1,5–4 s: para um adversário, para o parceiro ou para a mesa. O Desconfiado vigia mais os adversários; o Zé do Blefe vigia menos. Na plaquinha do adversário, o 👁 acende quando ele está te olhando. |
| Quando os bots sinalizam | Depois da distribuição e no começo de cada vaza, cada afirmação uma vez por mão. Esperam ninguém estar olhando: o Desconfiado nunca sinaliza vigiado, o Equilibrado raramente, o Zé do Blefe é descuidado (e às vezes manda sinal falso quando está cego). |
| O que os bots fazem com isso | Usam a carta conhecida do parceiro no cálculo de chance (aceitam e pedem truco com mais confiança) e não gastam carta boa quando o parceiro cobre. Carta de adversário interceptada também entra no cálculo. |
| Efeito medido | Em 1.000 partidas simuladas, a dupla que troca sinais vence **~54%** contra ~50% do controle sem sinais. O ganho é real, mas moderado: no truco a sorte pesa muito. |
| Seus sinais | Botão **Sinais** (roda) ou teclas 1–6, com intervalo de 2 s entre sinais. Só em mão normal (não na Mão de 10 nem na Mão de Ferro). Você vê um balão "😉 você piscou", porque não vê o próprio rosto. |
| Sinais dos adversários | Os gestos aparecem nos avatares, com um emoji rápido perto do rosto. Cabe a você perceber e interpretar. |

## Online (Fase 3a)

| Tema | Decisão |
|---|---|
| Arquitetura | Supabase (Postgres + login) + uma função na Vercel (`/api`) que é a autoridade do jogo. Sem servidor dedicado. |
| Embaralhamento | No online, o servidor embaralha com `crypto.getRandomValues`. A semente de 32 bits do offline seria previsível: dava para descobrir as cartas de todos testando sementes. |
| Cartas escondidas | O estado completo fica numa tabela que nenhum cliente lê. A API devolve só a visão de cada jogador, e em cada distribuição só a própria mão. |
| Bots no servidor | Depois da sua jogada, o servidor joga pelos bots até ser sua vez de novo e devolve os eventos com as pausas de "pensar" para o cliente animar. |
| Uma partida ativa | Começar outra partida abandona a anterior (não conta estatística). Dá para continuar a ativa pelo menu. |
| Login | Link mágico + código de 6 dígitos no mesmo e-mail (o código resolve quando o link abre em outro navegador). Exige SMTP próprio (ver `docs/ONLINE.md`). |
| Sinais secretos | Só no offline por enquanto. |
| Próximas etapas | 3b: salas com amigos, fila, timer de 15 s, bot assume quando alguém cai. 3c: duplas fixas, ELO, ligas e ranking. |

## Escopo

Ainda fora: online, lobby e reconexão, vozes gravadas (as falas aparecem como balões de texto), ranking, duplas e campeonatos, e o timer de 15 s por jogada.

## Limitações conhecidas

- Avatares e cenário são provisórios (geometria simples, sem modelos 3D externos).
- Sons são sintetizados (WebAudio), não gravados.
- A IA é heurística. A calibragem fica em `packages/bots/src/personalities.ts`.
- Desempenho: validado em hardware real (celular e PC), com animações fluidas. Sem GPU (renderização por software), o jogo entra sozinho em qualidade baixa.
