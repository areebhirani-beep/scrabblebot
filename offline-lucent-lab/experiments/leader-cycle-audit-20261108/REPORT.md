# Current leader continuation audit

Public snapshot: 2026-11-08T01:13:50.358306+00:00. All games below have six seats.

The current top five were RackMaw, LUCENT, aipom, Bron and LexForge-1107. Each last-20 cohort includes losses. Each last-10-wins cohort is selected on victory and is descriptive only, never an estimated win rate. Rankings continue to change. Opponent versions and source code are private.

## All outcomes in the last 20 games

| Bot | Wins / 20 | Mean score | First word | Second word | Third and later | Q4 tiles | Q4 spend |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| RackMaw | 9 | 99.30 | 53.15 | 35.10 | 11.05 | 4.75 | 66.25 |
| LUCENT | 5 | 76.95 | 39.30 | 32.15 | 5.50 | 3.00 | 43.90 |
| aipom | 8 | 102.50 | 44.15 | 38.35 | 20.00 | 3.90 | 42.20 |
| Bron | 4 | 83.90 | 38.40 | 35.15 | 10.35 | 4.10 | 50.50 |
| LexForge-1107 | 11 | 102.60 | 50.70 | 37.85 | 14.05 | 3.30 | 40.50 |
| Odysseus's Voyage | 5 | 79.30 | 45.15 | 30.40 | 3.75 | 0.90 | 10.20 |

## Findings and falsifiable adaptations

1. **Continuation is the clearest shared gap.** Odysseus scores 45.15 on its first word, 30.40 on its second and 3.75 thereafter. Every top-five bot buys 3.0–4.75 tiles in Q4 versus our 0.9. Our Q4 spending is10.2 coins versus40.5–66.25. This is observational evidence of a late acquisition bottleneck, not proof that indiscriminate spending wins.
2. **The acquisition weakness begins early too.** Our Q1 buys average0.5, compared with2.15–3.7 for all five leaders. We concentrate purchases in Q2/Q3 (4.2/5.05). Check both slow starts and late restart valuation; merely speeding word submission cannot explain this full pattern.
3. **There is no universal two-seven-letter recipe.** RackMaw has1.15 seven-plus words per game averaging51.65 points each; LUCENT has1.60 averaging39.84. RackMaw wins9/20 at99.3 mean; LUCENT wins5/20 at76.95, below our79.3 in this recent sample. LexForge wins11/20 at102.6 with1.45 seven-plus words averaging48.62. High-value five/six-letter conversions can support a second and third cycle.
4. **Cash starvation and empty-rack restart are distinct.** Match45219: BOWLIKE48 then UNMATED30 left EFLO/cash8; FLOE10 remained until the end. Both the strict starvation threshold and minimum length5 blocked it. Match45248: WHITEYS48 then TAMBURAS36 emptied the rack around49.2s with47 coins; all later logged bids lost and later auctions had no recorded attempt. The first case is a liquidity gate; the second is acquisition/restart valuation with available cash. Old logs cannot prove acknowledgement.
5. **Preserve profitable shorter words and residual inventory when testing.** RackMaw45248 wins with OPAQUED57, CONVEX45 and SKAG13. GodOfThudner45219 wins with DEXTRAN45, QUARTO37, CRYPTO32, BLUSH20 and EF5. A blanket shorter-word ban contradicts these observed wins. An eight-letter cashout can also exhaust useful continuation tiles; compare total attainable continuation, not length alone.
6. **Tests must judge full games, including failures.** The guarded completion floor reduced synthetic score and wins and remains disabled. A cash9/minimum4 candidate fixes the EFLO fixture but also failed its64-world screen; it remains disabled. The next discriminating experiment should target cash-rich small-rack continuation with bounded acquisition costs and remaining auctions, plus high-value conversion quality. Require improved paired wins/score and Q4 useful acquisitions; reject a candidate that merely buys more or chases unfinishable premium letters.

## Last ten wins for each current top-five bot

| Bot | Mean score in selected wins | First | Second | Third and later | Q4 tiles | Q4 spend |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| RackMaw | 111.80 | 54.90 | 41.00 | 15.90 | 5.70 | 70.70 |
| LUCENT | 108.70 | 48.00 | 46.60 | 14.10 | 3.30 | 41.90 |
| aipom | 115.50 | 43.90 | 41.90 | 29.70 | 2.90 | 29.70 |
| Bron | 117.90 | 45.00 | 49.40 | 23.50 | 5.60 | 65.80 |
| LexForge-1107 | 118.30 | 54.90 | 43.30 | 20.10 | 4.00 | 47.90 |

## Individual games

Every row records the complete word sequence, points, seconds since start, cash after each word, subsequent purchases, final-quarter activity and remaining cash. The full JSON additionally preserves every purchase and cash transition. The first two sections cover every one of the top two bots’ last20 games; subsequent sections cover all50 requested winning bot-games. Some matches overlap by design.

### RackMaw — last20

Date range UTC: 2026-11-08T00:47:03.610403+00:00 to 2026-11-08T01:11:36.932029+00:00

| Match / place | Complete word sequence: points @ seconds; cash after | Purchases after each word until next/end | Q4 tiles / spend | End cash | Per-game observation |
| --- | --- | --- | --- | ---: | --- |
| [45150](https://scrabblebot.spacetimedb.com/matches/45150) / 2 | EYEHOOK 51@34.2s ($62) → QIVIUT 45@55.5s ($59) → AXITE 24@64.5s ($35) | 5 / 4 / 1 | 6 / 87 | 8 | high-value opening; 40+ second conversion; 20+ third/later points; 5+ late acquisitions |
| [45157](https://scrabblebot.spacetimedb.com/matches/45157) / 2 | MEDICKS 48@22.8s ($84) → WIFTY 28@56.9s ($33) → EGRET 12@56.9s ($45) → OW 5@67.9s ($5) | 6 / 0 / 3 / 0 | 4 / 64 | 5 | high-value opening |
| [45164](https://scrabblebot.spacetimedb.com/matches/45164) / 2 | JUDASES 45@27.5s ($119) → HAZIER 45@51.9s ($54) → NOVEL 16@68.0s ($22) | 6 / 5 / 0 | 5 / 48 | 22 | high-value opening; 40+ second conversion; 5+ late acquisitions |
| [45171](https://scrabblebot.spacetimedb.com/matches/45171) / 2 | CALORIZED 63@28.8s ($91) → JOHN 21@68.7s ($32) | 5 / 0 | 2 / 26 | 32 | high-value opening |
| [45179](https://scrabblebot.spacetimedb.com/matches/45179) / 2 | QUIETED 51@39.3s ($68) → BOWFIN 35@73.4s ($46) → MERK 15@76.5s ($23) | 5 / 2 / 0 | 4 / 67 | 23 | high-value opening |
| [45187](https://scrabblebot.spacetimedb.com/matches/45187) / 1 | REFROZE 57@27.9s ($73) → WAVERED 42@40.2s ($51) → DEW 7@67.9s ($12) | 6 / 3 / 0 | 2 / 31 | 12 | high-value opening; 40+ second conversion |
| [45195](https://scrabblebot.spacetimedb.com/matches/45195) / 5 | KAZOOS 47@60.2s ($51) → DAVIT 18@64.4s ($21) | 3 / 1 | 6 / 87 | 6 | high-value opening; 5+ late acquisitions |
| [45202](https://scrabblebot.spacetimedb.com/matches/45202) / 1 | ALIQUOT 48@16.0s ($107) → FIEFDOM 48@60.3s ($62) → THOU 10@67.2s ($12) → BI 4@67.2s ($16) | 8 / 4 / 0 / 0 | 7 / 100 | 16 | high-value opening; 40+ second conversion; 5+ late acquisitions |
| [45209](https://scrabblebot.spacetimedb.com/matches/45209) / 2 | VIXENLY 60@49.7s ($73) → BROCHE 32@61.8s ($43) | 3 / 3 | 5 / 84 | 5 | high-value opening; 5+ late acquisitions |
| [45217](https://scrabblebot.spacetimedb.com/matches/45217) / 1 | ENJOYED 54@43.0s ($76) → GAWKY 32@60.0s ($38) → LETCH 20@72.0s ($25) | 4 / 4 / 1 | 5 / 55 | 3 | high-value opening; 20+ third/later points; 5+ late acquisitions |
| [45225](https://scrabblebot.spacetimedb.com/matches/45225) / 3 | QUINONE 48@53.4s ($70) → FIX 13@67.4s ($18) → PA 4@67.4s ($22) | 3 / 0 / 0 | 4 / 76 | 22 | high-value opening |
| [45233](https://scrabblebot.spacetimedb.com/matches/45233) / 1 | MIXTURE 48@42.3s ($77) → QUOTED 40@67.4s ($50) → AS 2@67.4s ($52) | 5 / 0 / 0 | 3 / 40 | 52 | high-value opening; 40+ second conversion |
| [45241](https://scrabblebot.spacetimedb.com/matches/45241) / 1 | VAQUERO 57@57.3s ($69) → EXPLOIT 48@67.9s ($63) → NO 2@67.9s ($65) | 5 / 0 / 0 | 7 / 81 | 65 | high-value opening; 40+ second conversion; 5+ late acquisitions |
| [45248](https://scrabblebot.spacetimedb.com/matches/45248) / 1 | OPAQUED 57@54.8s ($70) → CONVEX 45@62.9s ($48) → SKAG 13@66.8s ($13) | 4 / 3 / 0 | 8 / 127 | 13 | high-value opening; 40+ second conversion; 5+ late acquisitions |
| [45256](https://scrabblebot.spacetimedb.com/matches/45256) / 1 | WRINKLY 51@21.8s ($84) → JUNCO 28@52.0s ($41) → QUOTA 28@63.0s ($30) → HEP 8@68.0s ($24) | 4 / 3 / 2 / 0 | 5 / 53 | 24 | high-value opening; 20+ third/later points; 5+ late acquisitions |
| [45264](https://scrabblebot.spacetimedb.com/matches/45264) / 3 | UNRAZED 51@43.1s ($81) → SYMBION 42@68.1s ($48) | 5 / 0 | 3 / 57 | 48 | high-value opening; 40+ second conversion |
| [45271](https://scrabblebot.spacetimedb.com/matches/45271) / 2 | QUAKED 50@43.6s ($64) → RAMJET 37@53.7s ($42) → FOU 6@68.0s ($8) | 3 / 3 / 0 | 4 / 77 | 8 | high-value opening |
| [45279](https://scrabblebot.spacetimedb.com/matches/45279) / 3 | UTILIZE 48@14.7s ($93) → WINCER 27@63.7s ($39) → MAT 5@67.7s ($7) | 7 / 2 / 0 | 3 / 48 | 7 | high-value opening |
| [45287](https://scrabblebot.spacetimedb.com/matches/45287) / 1 | JONQUIL 69@46.7s ($82) → VECTORED 42@65.0s ($56) → PIPS 12@69.4s ($37) | 6 / 3 / 1 | 8 / 74 | 36 | high-value opening; 40+ second conversion; 5+ late acquisitions |
| [45295](https://scrabblebot.spacetimedb.com/matches/45295) / 1 | FOXHOLE 60@34.8s ($75) → RITZY 34@62.7s ($46) → QUATE 28@67.8s ($42) | 6 / 2 / 0 | 4 / 43 | 42 | high-value opening; 20+ third/later points |

### LUCENT — last20

Date range UTC: 2026-11-08T00:42:48.768935+00:00 to 2026-11-08T01:08:51.188667+00:00

| Match / place | Complete word sequence: points @ seconds; cash after | Purchases after each word until next/end | Q4 tiles / spend | End cash | Per-game observation |
| --- | --- | --- | --- | ---: | --- |
| [45128](https://scrabblebot.spacetimedb.com/matches/45128) / 2 | JAWBONE 57@14.1s ($97) → DISCARD 33@52.2s ($52) → GENE 7@66.1s ($14) | 6 / 4 / 0 | 5 / 60 | 14 | high-value opening; 5+ late acquisitions |
| [45134](https://scrabblebot.spacetimedb.com/matches/45134) / 1 | FUTHORKS 54@14.1s ($101) → QUIRTED 51@54.0s ($59) → EX 9@68.3s ($46) | 7 / 2 / 0 | 3 / 32 | 46 | high-value opening; 40+ second conversion |
| [45141](https://scrabblebot.spacetimedb.com/matches/45141) / 3 | GRAVELY 42@29.5s ($88) → PROW 13@52.4s ($26) → TWINE 16@68.8s ($17) | 5 / 2 / 0 | 2 / 25 | 17 | 29 points after opening; 7 later acquisitions |
| [45148](https://scrabblebot.spacetimedb.com/matches/45148) / 2 | ANGLING 27@40.4s ($32) → RORQUAL 48@53.5s ($62) | 2 / 3 | 4 / 68 | 2 | 40+ second conversion |
| [45155](https://scrabblebot.spacetimedb.com/matches/45155) / 1 | BIMORPH 48@10.2s ($105) → QUAILED 51@39.3s ($76) → ROUT 6@66.1s ($14) → EN 2@68.0s ($7) | 6 / 5 / 1 / 0 | 4 / 60 | 7 | high-value opening; 40+ second conversion |
| [45162](https://scrabblebot.spacetimedb.com/matches/45162) / 4 | DRAPING 33@41.4s ($53) → OUTLOVE 30@65.8s ($35) → OR 2@67.8s ($30) | 4 / 1 / 0 | 2 / 16 | 30 | 32 points after opening; 5 later acquisitions |
| [45169](https://scrabblebot.spacetimedb.com/matches/45169) / 1 | WARLORD 33@28.2s ($71) → LOQUATS 48@40.2s ($60) → TOGUE 12@67.0s ($20) → XI 9@67.0s ($29) | 6 / 5 / 0 / 1 | 3 / 34 | 21 | 40+ second conversion; 20+ third/later points |
| [45176](https://scrabblebot.spacetimedb.com/matches/45176) / 2 | FLOURED 33@28.3s ($77) → QUININ 37@65.5s ($38) | 5 / 1 | 3 / 54 | 24 | cash<10 for10.1s |
| [45183](https://scrabblebot.spacetimedb.com/matches/45183) / 5 | UPROOTED 33@55.5s ($58) → RALLY 16@74.8s ($16) | 4 / 0 | 2 / 24 | 16 | 16 points after opening; 4 later acquisitions |
| [45191](https://scrabblebot.spacetimedb.com/matches/45191) / 6 | BARROOM 33@32.0s ($72) → ACTING 22@66.6s ($28) | 5 / 0 | 1 / 18 | 28 | cash<10 for12.1s |
| [45199](https://scrabblebot.spacetimedb.com/matches/45199) / 4 | BEWEEPS 42@28.3s ($97) → GOITROUS 27@64.9s ($30) | 7 / 0 | 3 / 44 | 30 | 27 points after opening; 7 later acquisitions |
| [45206](https://scrabblebot.spacetimedb.com/matches/45206) / 3 | DEIFORM 39@28.2s ($82) → GLAIKET 36@56.1s ($38) → IT 2@66.1s ($7) | 5 / 2 / 0 | 4 / 79 | 7 | 38 points after opening; 7 later acquisitions |
| [45213](https://scrabblebot.spacetimedb.com/matches/45213) / 4 | GROWLED 36@28.2s ($73) → AVAUNT 22@73.3s ($22) | 5 / 0 | 2 / 32 | 22 | 22 points after opening; 5 later acquisitions |
| [45221](https://scrabblebot.spacetimedb.com/matches/45221) / 1 | ODORIZE 51@3.1s ($119) → DAYLONG 36@47.3s ($47) → ATMAS 14@66.1s ($21) → AI 2@68.1s ($6) | 9 / 3 / 1 / 0 | 4 / 57 | 6 | high-value opening; cash<10 for10.2s |
| [45228](https://scrabblebot.spacetimedb.com/matches/45228) / 2 | JAGGIER 48@18.1s ($92) → VENUE 16@64.7s ($26) → OF 5@64.7s ($31) → OP 4@66.7s ($24) | 7 / 0 / 1 / 1 | 3 / 45 | 13 | high-value opening |
| [45236](https://scrabblebot.spacetimedb.com/matches/45236) / 3 | CHLORID 39@35.5s ($69) → KALLIDIN 39@53.1s ($42) → AE 2@66.1s ($4) | 5 / 3 / 0 | 4 / 55 | 4 | 41 points after opening; 8 later acquisitions |
| [45244](https://scrabblebot.spacetimedb.com/matches/45244) / 4 | ORIGANUM 33@40.8s ($70) → RAZES 28@65.8s ($30) → OP 4@67.9s ($5) | 3 / 1 / 0 | 1 / 29 | 5 | cash<10 for17.1s |
| [45252](https://scrabblebot.spacetimedb.com/matches/45252) / 1 | PIOSITY 36@29.5s ($83) → ORGANZA 51@42.6s ($80) → PILEI 14@66.7s ($14) | 5 / 6 / 0 | 3 / 43 | 14 | 40+ second conversion |
| [45260](https://scrabblebot.spacetimedb.com/matches/45260) / 2 | BEWRAPT 42@43.3s ($57) → DOVECOT 39@50.3s ($55) | 5 / 1 | 0 / 0 | 52 | zero Q4 purchases |
| [45279](https://scrabblebot.spacetimedb.com/matches/45279) / 6 | AERATING 27@55.2s ($78) | 4 | 7 / 103 | 10 | 5+ late acquisitions |

### RackMaw — last10Wins

Date range UTC: 2026-11-08T00:45:42.862648+00:00 to 2026-11-08T01:11:36.932029+00:00

| Match / place | Complete word sequence: points @ seconds; cash after | Purchases after each word until next/end | Q4 tiles / spend | End cash | Per-game observation |
| --- | --- | --- | --- | ---: | --- |
| [45143](https://scrabblebot.spacetimedb.com/matches/45143) / 1 | EQUATOR 48@18.8s ($90) → EXPOUND 51@58.8s ($77) → BADGES 25@65.8s ($33) | 6 / 5 / 1 | 8 / 103 | 21 | high-value opening; 40+ second conversion; 20+ third/later points; 5+ late acquisitions |
| [45187](https://scrabblebot.spacetimedb.com/matches/45187) / 1 | REFROZE 57@27.9s ($73) → WAVERED 42@40.2s ($51) → DEW 7@67.9s ($12) | 6 / 3 / 0 | 2 / 31 | 12 | high-value opening; 40+ second conversion |
| [45202](https://scrabblebot.spacetimedb.com/matches/45202) / 1 | ALIQUOT 48@16.0s ($107) → FIEFDOM 48@60.3s ($62) → THOU 10@67.2s ($12) → BI 4@67.2s ($16) | 8 / 4 / 0 / 0 | 7 / 100 | 16 | high-value opening; 40+ second conversion; 5+ late acquisitions |
| [45217](https://scrabblebot.spacetimedb.com/matches/45217) / 1 | ENJOYED 54@43.0s ($76) → GAWKY 32@60.0s ($38) → LETCH 20@72.0s ($25) | 4 / 4 / 1 | 5 / 55 | 3 | high-value opening; 20+ third/later points; 5+ late acquisitions |
| [45233](https://scrabblebot.spacetimedb.com/matches/45233) / 1 | MIXTURE 48@42.3s ($77) → QUOTED 40@67.4s ($50) → AS 2@67.4s ($52) | 5 / 0 / 0 | 3 / 40 | 52 | high-value opening; 40+ second conversion |
| [45241](https://scrabblebot.spacetimedb.com/matches/45241) / 1 | VAQUERO 57@57.3s ($69) → EXPLOIT 48@67.9s ($63) → NO 2@67.9s ($65) | 5 / 0 / 0 | 7 / 81 | 65 | high-value opening; 40+ second conversion; 5+ late acquisitions |
| [45248](https://scrabblebot.spacetimedb.com/matches/45248) / 1 | OPAQUED 57@54.8s ($70) → CONVEX 45@62.9s ($48) → SKAG 13@66.8s ($13) | 4 / 3 / 0 | 8 / 127 | 13 | high-value opening; 40+ second conversion; 5+ late acquisitions |
| [45256](https://scrabblebot.spacetimedb.com/matches/45256) / 1 | WRINKLY 51@21.8s ($84) → JUNCO 28@52.0s ($41) → QUOTA 28@63.0s ($30) → HEP 8@68.0s ($24) | 4 / 3 / 2 / 0 | 5 / 53 | 24 | high-value opening; 20+ third/later points; 5+ late acquisitions |
| [45287](https://scrabblebot.spacetimedb.com/matches/45287) / 1 | JONQUIL 69@46.7s ($82) → VECTORED 42@65.0s ($56) → PIPS 12@69.4s ($37) | 6 / 3 / 1 | 8 / 74 | 36 | high-value opening; 40+ second conversion; 5+ late acquisitions |
| [45295](https://scrabblebot.spacetimedb.com/matches/45295) / 1 | FOXHOLE 60@34.8s ($75) → RITZY 34@62.7s ($46) → QUATE 28@67.8s ($42) | 6 / 2 / 0 | 4 / 43 | 42 | high-value opening; 20+ third/later points |

### LUCENT — last10Wins

Date range UTC: 2026-11-08T00:06:44.080533+00:00 to 2026-11-08T01:04:41.385278+00:00

| Match / place | Complete word sequence: points @ seconds; cash after | Purchases after each word until next/end | Q4 tiles / spend | End cash | Per-game observation |
| --- | --- | --- | --- | ---: | --- |
| [43221](https://scrabblebot.spacetimedb.com/matches/43221) / 1 | FOZIEST 57@24.9s ($88) → WHOOFED 51@57.3s ($56) → PAVE 13@66.4s ($19) | 6 / 4 / 0 | 5 / 65 | 19 | high-value opening; 40+ second conversion; 5+ late acquisitions |
| [43242](https://scrabblebot.spacetimedb.com/matches/43242) / 1 | FOAMIER 36@28.9s ($77) → QUANTED 51@45.9s ($62) → MANHOLE 36@55.9s ($37) → IT 2@66.9s ($21) | 7 / 4 / 2 / 0 | 3 / 32 | 21 | 40+ second conversion; 20+ third/later points |
| [43306](https://scrabblebot.spacetimedb.com/matches/43306) / 1 | HEXEREI 51@11.3s ($105) → TAMPING 36@58.6s ($43) → WAVE 15@66.8s ($19) | 8 / 3 / 0 | 5 / 63 | 19 | high-value opening; 5+ late acquisitions |
| [45057](https://scrabblebot.spacetimedb.com/matches/45057) / 1 | HEROIZED 63@40.7s ($70) → VAGUER 25@66.4s ($26) → OF 5@68.4s ($23) | 5 / 1 / 0 | 1 / 8 | 23 | high-value opening; cash<10 for16.6s |
| [45070](https://scrabblebot.spacetimedb.com/matches/45070) / 1 | AJOWANS 51@22.5s ($95) → QUIVERY 66@55.7s ($69) → TO 2@66.6s ($60) | 5 / 1 / 0 | 2 / 25 | 60 | high-value opening; 40+ second conversion |
| [45134](https://scrabblebot.spacetimedb.com/matches/45134) / 1 | FUTHORKS 54@14.1s ($101) → QUIRTED 51@54.0s ($59) → EX 9@68.3s ($46) | 7 / 2 / 0 | 3 / 32 | 46 | high-value opening; 40+ second conversion |
| [45155](https://scrabblebot.spacetimedb.com/matches/45155) / 1 | BIMORPH 48@10.2s ($105) → QUAILED 51@39.3s ($76) → ROUT 6@66.1s ($14) → EN 2@68.0s ($7) | 6 / 5 / 1 / 0 | 4 / 60 | 7 | high-value opening; 40+ second conversion |
| [45169](https://scrabblebot.spacetimedb.com/matches/45169) / 1 | WARLORD 33@28.2s ($71) → LOQUATS 48@40.2s ($60) → TOGUE 12@67.0s ($20) → XI 9@67.0s ($29) | 6 / 5 / 0 / 1 | 3 / 34 | 21 | 40+ second conversion; 20+ third/later points |
| [45221](https://scrabblebot.spacetimedb.com/matches/45221) / 1 | ODORIZE 51@3.1s ($119) → DAYLONG 36@47.3s ($47) → ATMAS 14@66.1s ($21) → AI 2@68.1s ($6) | 9 / 3 / 1 / 0 | 4 / 57 | 6 | high-value opening; cash<10 for10.2s |
| [45252](https://scrabblebot.spacetimedb.com/matches/45252) / 1 | PIOSITY 36@29.5s ($83) → ORGANZA 51@42.6s ($80) → PILEI 14@66.7s ($14) | 5 / 6 / 0 | 3 / 43 | 14 | 40+ second conversion |

### aipom — last10Wins

Date range UTC: 2026-11-08T00:39:38.009260+00:00 to 2026-11-08T01:08:51.188667+00:00

| Match / place | Complete word sequence: points @ seconds; cash after | Purchases after each word until next/end | Q4 tiles / spend | End cash | Per-game observation |
| --- | --- | --- | --- | ---: | --- |
| [45112](https://scrabblebot.spacetimedb.com/matches/45112) / 1 | NOWHERE 39@17.9s ($110) → JAILED 35@26.2s ($66) → TANGED 20@66.9s ($22) | 5 / 6 / 0 | 0 / 0 | 22 | 20+ third/later points; cash<10 for15.3s; zero Q4 purchases |
| [45125](https://scrabblebot.spacetimedb.com/matches/45125) / 1 | DIGNIFY 45@15.2s ($102) → AJOWANS 51@32.7s ($60) → FRINGED 36@67.2s ($42) | 8 / 5 / 1 | 2 / 12 | 36 | high-value opening; 40+ second conversion; 20+ third/later points |
| [45158](https://scrabblebot.spacetimedb.com/matches/45158) / 1 | JIBINGLY 63@22.9s ($111) → AGRAFES 33@33.0s ($52) → WHEEPS 35@41.7s ($41) → HIST 10@67.1s ($10) | 8 / 4 / 4 / 0 | 1 / 8 | 10 | high-value opening; 20+ third/later points; cash<10 for18.8s |
| [45171](https://scrabblebot.spacetimedb.com/matches/45171) / 1 | PIRATIC 33@14.9s ($87) → BOLIVIAS 39@27.7s ($45) → FLAUNT 22@54.2s ($24) | 8 / 3 / 1 | 2 / 42 | 7 | 20+ third/later points |
| [45178](https://scrabblebot.spacetimedb.com/matches/45178) / 1 | FOVEATE 39@36.2s ($51) → PINETUM 33@49.9s ($38) → JET 10@70.2s ($10) → CAW 8@75.2s ($12) | 4 / 4 / 2 / 0 | 5 / 35 | 12 | 5+ late acquisitions |
| [45213](https://scrabblebot.spacetimedb.com/matches/45213) / 1 | ATOMIZE 54@22.9s ($95) → JINGKOES 60@35.8s ($98) → TAVERN 22@74.3s ($25) | 3 / 6 / 0 | 3 / 52 | 25 | high-value opening; 40+ second conversion; 20+ third/later points |
| [45235](https://scrabblebot.spacetimedb.com/matches/45235) / 1 | ZONATED 51@28.3s ($107) → BEEFING 39@47.2s ($40) → ALLOW 16@66.9s ($23) | 8 / 2 / 0 | 2 / 33 | 23 | high-value opening |
| [45249](https://scrabblebot.spacetimedb.com/matches/45249) / 1 | DIVULGE 36@28.9s ($95) → FIREBUG 39@49.8s ($57) → AWEARY 30@61.7s ($39) → EAU 3@68.0s ($31) → ID 3@69.0s ($33) | 7 / 5 / 3 / 1 / 0 | 8 / 49 | 33 | 20+ third/later points; 5+ late acquisitions |
| [45265](https://scrabblebot.spacetimedb.com/matches/45265) / 1 | COAXED 40@28.0s ($87) → JARGONEL 48@40.0s ($57) → ASQUINT 48@53.9s ($51) → FORE 10@66.7s ($18) | 7 / 5 / 4 / 0 | 5 / 56 | 18 | 40+ second conversion; 20+ third/later points; 5+ late acquisitions |
| [45279](https://scrabblebot.spacetimedb.com/matches/45279) / 1 | OVERBID 39@22.9s ($108) → BOWERING 42@33.9s ($69) → AUGITES 24@48.0s ($27) | 7 / 7 / 1 | 1 / 10 | 17 | 40+ second conversion; 20+ third/later points |

### Bron — last10Wins

Date range UTC: 2026-11-08T00:23:14.430365+00:00 to 2026-11-08T01:11:23.705755+00:00

| Match / place | Complete word sequence: points @ seconds; cash after | Purchases after each word until next/end | Q4 tiles / spend | End cash | Per-game observation |
| --- | --- | --- | --- | ---: | --- |
| [43313](https://scrabblebot.spacetimedb.com/matches/43313) / 1 | WHINIER 39@24.5s ($85) → OXYSALT 51@46.5s ($98) → VENOMED 39@63.7s ($48) → JAW 13@69.0s ($36) | 4 / 8 / 3 / 0 | 9 / 94 | 36 | 40+ second conversion; 20+ third/later points; 5+ late acquisitions |
| [45064](https://scrabblebot.spacetimedb.com/matches/45064) / 1 | OFFICER 45@37.0s ($66) → QUERIED 51@67.3s ($52) → EXPO 19@68.3s ($71) | 7 / 0 / 0 | 4 / 31 | 71 | high-value opening; 40+ second conversion |
| [45082](https://scrabblebot.spacetimedb.com/matches/45082) / 1 | FRANKER 42@22.7s ($97) → QUIRTED 51@47.7s ($61) → NONGAY 25@68.2s ($30) | 7 / 5 / 0 | 4 / 46 | 30 | 40+ second conversion; 20+ third/later points |
| [45107](https://scrabblebot.spacetimedb.com/matches/45107) / 1 | MICROBAR 42@43.9s ($77) → BLUFFING 51@59.9s ($58) → DARKY 26@67.9s ($29) → IS 2@67.9s ($31) | 8 / 5 / 0 / 0 | 7 / 70 | 31 | 40+ second conversion; 20+ third/later points; 5+ late acquisitions |
| [45127](https://scrabblebot.spacetimedb.com/matches/45127) / 1 | EJECTOR 48@21.5s ($112) → OXIDISE 45@51.5s ($61) → FOVEA 22@67.7s ($24) | 7 / 7 / 0 | 7 / 59 | 24 | high-value opening; 40+ second conversion; 20+ third/later points; 5+ late acquisitions |
| [45139](https://scrabblebot.spacetimedb.com/matches/45139) / 1 | FUTZING 60@32.8s ($79) → PLACEBO 39@60.3s ($57) → EX 9@69.4s ($10) → MY 7@69.4s ($17) | 6 / 3 / 0 / 0 | 4 / 68 | 17 | high-value opening |
| [45153](https://scrabblebot.spacetimedb.com/matches/45153) / 1 | HENEQUEN 60@18.3s ($105) → ATYPIC 32@67.7s ($39) → CZAR 22@67.7s ($61) | 8 / 0 / 0 | 2 / 17 | 61 | high-value opening; 20+ third/later points |
| [45188](https://scrabblebot.spacetimedb.com/matches/45188) / 1 | SANCTUM 33@13.6s ($112) → QUAIGHS 60@53.7s ($68) → SWEATER 30@61.7s ($60) → LO 2@68.7s ($6) | 10 / 4 / 4 / 0 | 9 / 107 | 6 | 40+ second conversion; 20+ third/later points; 5+ late acquisitions |
| [45255](https://scrabblebot.spacetimedb.com/matches/45255) / 1 | FOLDERS 33@18.2s ($103) → MIQUELET 57@58.5s ($68) → OX 9@68.5s ($25) | 8 / 2 / 0 | 4 / 79 | 25 | 40+ second conversion |
| [45294](https://scrabblebot.spacetimedb.com/matches/45294) / 1 | FIEFDOM 48@23.2s ($87) → EXIGUITY 57@58.5s ($60) → ANOAS 10@67.8s ($13) | 6 / 4 / 0 | 6 / 87 | 13 | high-value opening; 40+ second conversion; 5+ late acquisitions |

### LexForge-1107 — last10Wins

Date range UTC: 2026-11-08T00:51:46.477277+00:00 to 2026-11-08T01:09:30.502900+00:00

| Match / place | Complete word sequence: points @ seconds; cash after | Purchases after each word until next/end | Q4 tiles / spend | End cash | Per-game observation |
| --- | --- | --- | --- | ---: | --- |
| [45177](https://scrabblebot.spacetimedb.com/matches/45177) / 1 | FOWLPOX 66@29.9s ($76) → DEUTZIA 51@44.0s ($65) → DEIFIC 30@56.0s ($33) → RIN 3@76.5s ($5) | 4 / 5 / 3 / 0 | 4 / 43 | 5 | high-value opening; 40+ second conversion; 20+ third/later points; cash<10 for13.7s |
| [45199](https://scrabblebot.spacetimedb.com/matches/45199) / 1 | QUOINED 51@15.8s ($108) → KHALIFA 51@46.1s ($80) → CATENA 20@64.4s ($22) → IN 2@67.4s ($9) | 6 / 6 / 1 / 0 | 3 / 52 | 9 | high-value opening; 40+ second conversion; 20+ third/later points |
| [45206](https://scrabblebot.spacetimedb.com/matches/45206) / 1 | QUIETLY 57@29.7s ($91) → WOOSHED 42@42.5s ($53) → WART 10@67.4s ($15) | 5 / 3 / 0 | 3 / 48 | 15 | high-value opening; 40+ second conversion |
| [45214](https://scrabblebot.spacetimedb.com/matches/45214) / 1 | LAZYISH 66@31.2s ($78) → LIQUORED 54@64.1s ($70) → ALONE 10@72.1s ($19) | 6 / 4 / 0 | 6 / 76 | 19 | high-value opening; 40+ second conversion; 5+ late acquisitions |
| [45222](https://scrabblebot.spacetimedb.com/matches/45222) / 1 | DAKOITY 45@32.4s ($65) → WAWLED 32@54.0s ($36) → GAZAR 30@63.0s ($35) → IXORA 24@68.0s ($25) → IT 2@68.7s ($24) | 5 / 5 / 4 / 1 / 0 | 11 / 86 | 24 | high-value opening; 20+ third/later points; 5+ late acquisitions |
| [45230](https://scrabblebot.spacetimedb.com/matches/45230) / 1 | FIXATED 54@21.1s ($64) → ZOONS 28@32.2s ($39) → TAWED 18@47.8s ($23) → AI 2@67.9s ($3) | 3 / 3 / 3 / 0 | 3 / 22 | 3 | high-value opening; 20+ third/later points |
| [45238](https://scrabblebot.spacetimedb.com/matches/45238) / 1 | VAPORIZE 66@23.0s ($111) → CHIMERAS 45@48.1s ($58) → YES 6@67.7s ($11) | 7 / 3 / 0 | 2 / 43 | 11 | high-value opening; 40+ second conversion |
| [45253](https://scrabblebot.spacetimedb.com/matches/45253) / 1 | WURZEL 45@30.5s ($59) → FOXES 30@36.5s ($36) → UNLIT 10@56.6s ($17) | 3 / 3 / 0 | 1 / 10 | 17 | high-value opening |
| [45261](https://scrabblebot.spacetimedb.com/matches/45261) / 1 | ANXIETY 51@34.9s ($79) → PREVIEW 45@46.0s ($69) → WAUL 10@68.2s ($16) → OE 2@68.2s ($18) | 4 / 5 / 0 / 0 | 3 / 39 | 18 | high-value opening; 40+ second conversion |
| [45284](https://scrabblebot.spacetimedb.com/matches/45284) / 1 | HAYWIRE 48@24.9s ($74) → JEZAIL 55@49.0s ($57) → UNMOLD 22@59.1s ($26) | 5 / 4 / 1 | 4 / 60 | 5 | high-value opening; 40+ second conversion; 20+ third/later points |

### Odysseus's Voyage — last20

Date range UTC: 2026-11-08T00:49:25.505275+00:00 to 2026-11-08T01:12:32.439401+00:00

| Match / place | Complete word sequence: points @ seconds; cash after | Purchases after each word until next/end | Q4 tiles / spend | End cash | Per-game observation |
| --- | --- | --- | --- | ---: | --- |
| [45163](https://scrabblebot.spacetimedb.com/matches/45163) / 3 | WOOZIER 57@30.8s ($70) → VERMIN 27@68.2s ($36) | 5 / 0 | 0 / 0 | 36 | high-value opening; cash<10 for27.2s; zero Q4 purchases |
| [45170](https://scrabblebot.spacetimedb.com/matches/45170) / 1 | VAQUERO 57@44.7s ($77) → WHELMED 48@69.3s ($56) | 5 / 0 | 1 / 9 | 56 | high-value opening; 40+ second conversion |
| [45177](https://scrabblebot.spacetimedb.com/matches/45177) / 2 | EQUATOR 48@24.4s ($121) → KIVAS 24@76.3s ($37) → NOB 5@76.4s ($42) | 7 / 0 / 0 | 0 / 0 | 42 | high-value opening; zero Q4 purchases |
| [45184](https://scrabblebot.spacetimedb.com/matches/45184) / 1 | JAWBONE 57@24.5s ($109) → BLAZON 42@42.3s ($49) → RATIO 10@52.7s ($15) | 6 / 4 / 0 | 0 / 0 | 15 | high-value opening; 40+ second conversion; zero Q4 purchases |
| [45191](https://scrabblebot.spacetimedb.com/matches/45191) / 2 | HIPLIKE 48@34.0s ($86) → WAIVERS 39@48.5s ($52) → URATE 10@68.6s ($15) | 6 / 4 / 0 | 1 / 11 | 15 | high-value opening |
| [45198](https://scrabblebot.spacetimedb.com/matches/45198) / 1 | MONIKER 39@20.2s ($85) → SCOWING 39@50.9s ($53) → AYS 6@67.9s ($19) | 6 / 2 / 0 | 1 / 15 | 19 | 45 points after opening; 8 later acquisitions |
| [45205](https://scrabblebot.spacetimedb.com/matches/45205) / 4 | DIAPHONE 42@44.6s ($76) → JUKE 22@68.3s ($32) | 4 / 0 | 0 / 0 | 32 | zero Q4 purchases |
| [45212](https://scrabblebot.spacetimedb.com/matches/45212) / 5 | GRANARY 33@39.2s ($68) → MALOTI 20@47.2s ($27) | 5 / 1 | 0 / 0 | 10 | zero Q4 purchases |
| [45219](https://scrabblebot.spacetimedb.com/matches/45219) / 2 | BOWLIKE 48@24.3s ($78) → UNMATED 30@37.2s ($36) → FLOE 10@68.1s ($18) | 6 / 2 / 0 | 0 / 0 | 18 | high-value opening; cash<10 for27.1s; zero Q4 purchases |
| [45226](https://scrabblebot.spacetimedb.com/matches/45226) / 5 | BOVINES 36@50.7s ($81) → DECURY 30@68.5s ($33) → AW 5@68.5s ($38) | 6 / 0 / 0 | 5 / 61 | 38 | 5+ late acquisitions |
| [45234](https://scrabblebot.spacetimedb.com/matches/45234) / 5 | MILIARY 36@23.6s ($96) → HAWK 21@68.2s ($26) → RUN 3@68.3s ($29) | 7 / 0 / 0 | 1 / 3 | 29 | cash<10 for32.4s |
| [45241](https://scrabblebot.spacetimedb.com/matches/45241) / 4 | HYGIENE 42@49.8s ($69) → BIFACE 32@68.3s ($40) | 6 / 0 | 4 / 33 | 40 | 32 points after opening; 6 later acquisitions |
| [45248](https://scrabblebot.spacetimedb.com/matches/45248) / 3 | WHITEYS 48@23.3s ($100) → TAMBURAS 36@49.2s ($47) | 7 / 0 | 0 / 0 | 47 | high-value opening; zero Q4 purchases |
| [45255](https://scrabblebot.spacetimedb.com/matches/45255) / 5 | OVERMAN 36@26.2s ($92) → OBELIA 20@40.3s ($27) | 6 / 1 | 0 / 0 | 14 | zero Q4 purchases |
| [45263](https://scrabblebot.spacetimedb.com/matches/45263) / 3 | WHORTLE 39@27.2s ($98) → MAFIC 24@68.4s ($34) → NO 2@68.5s ($36) | 6 / 0 / 0 | 0 / 0 | 36 | zero Q4 purchases |
| [45270](https://scrabblebot.spacetimedb.com/matches/45270) / 4 | TAWNILY 39@40.7s ($85) → FOVEAL 30@68.2s ($44) | 5 / 0 | 1 / 16 | 44 | 30 points after opening; 5 later acquisitions |
| [45278](https://scrabblebot.spacetimedb.com/matches/45278) / 4 | PRINKED 42@29.6s ($71) → OMASUM 25@68.1s ($33) | 5 / 0 | 0 / 0 | 33 | cash<10 for25.4s; zero Q4 purchases |
| [45286](https://scrabblebot.spacetimedb.com/matches/45286) / 5 | REDOCKED 48@38.4s ($63) → AHOY 15@68.9s ($24) | 4 / 0 | 0 / 0 | 24 | high-value opening; cash<10 for24.6s; zero Q4 purchases |
| [45294](https://scrabblebot.spacetimedb.com/matches/45294) / 1 | JOBBING 57@36.4s ($66) → DEWCLAW 48@39.4s ($73) → TETH 10@67.8s ($19) | 3 / 5 / 0 | 1 / 10 | 19 | high-value opening; 40+ second conversion; cash<10 for15.7s |
| [45301](https://scrabblebot.spacetimedb.com/matches/45301) / 1 | CUMSHAW 51@36.6s ($73) → PREVAIL 36@40.5s ($64) → OX 9@67.9s ($17) → EF 5@68.0s ($22) | 4 / 4 / 0 / 0 | 3 / 46 | 22 | high-value opening |

## Data checks and limits

All selected profiles reconcile word totals with public final score and reconstruct final cash from100 starting coins, auction payments and word income with zero mismatches. The raw auction results and highest-bid archive are saved beside this report. Private initial racks and receipt/rejection telemetry are not public.
Our recent cohort spans the original WIN30 client and one match after a client-only reliability release; strategy parameters were unchanged. Same-table comparisons are included in analysis.json (small samples: RackMaw2, LUCENT1, Bron4, LexForge5, aipom0). No comparison here proves causality or estimates tournament rank from synthetic wins. A top-five ranking and selected wins do not make every recent opponent policy successful.
Reproduce with audit_leader_cycles.py for a new snapshot; render this fixed snapshot with render_leader_cycles.py. Raw files are retained, not overwritten by the continuous leaderboard watcher.
