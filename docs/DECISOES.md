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

## Escopo

Fora do MVP: online, lobby e reconexão, sinais secretos e expressões faciais, vozes gravadas (as falas aparecem como balões de texto), ranking, duplas e campeonatos, e o timer de 15 s por jogada.

## Limitações conhecidas

- Avatares e cenário são provisórios (geometria simples, sem modelos 3D externos).
- Sons são sintetizados (WebAudio), não gravados.
- A IA é heurística. A calibragem fica em `packages/bots/src/personalities.ts`.
