# Recent Odysseus losses: evidence and corrective experiments

Recorded 2026-11-08 around 01:08 UTC. Bot172, current version2. These matches used the SAME pinned WIN30 source `6e4c09a6ffc24cc771b10d2bae542173d94dcee3c440b0dcf88ec146ffc17a1d`; the preceding wins and these losses were not separate code deployments.

## Match45212: rating1988 to1940, minus48

We scored53 and placed fifth. The winner scored117. Initial rack AGLRR; first purchase was K at round18 for28 coins. First word GRANARY33 arrived39.175 seconds into the game, versus the winner's WINCHED48 at16.189 seconds. The winner later played AQUEOUS48 and TELLIES21.

Our K28 and F17 purchases cost45 coins, 31.5% of the143 coins spent, and both letters remained unused. After the F purchase at round48, only10 coins remained; most bids were capped at7 by the70% balance limit. No further tiles were acquired in the remaining19 auctions. This supports delayed conversion and costly stranded inventory as economic weaknesses. It does not prove every premium purchase was irrational when made.

Two bid revisions need controlled investigation:

| Round, letter | Our logged bids | Archived winning bid | Evidence |
| --- | --- | ---: | --- |
|20, E|14 then9|11|Downward revision crossed the final competing maximum.|
|31, O|12 then7|10|Actual rack AAGKLNRR could immediately make legal GRANOLA for24 after acquiring O; balance54 made12 affordable.|

Holding12 on the O auction would beat the recorded final competing bids if accepted. It would permit a word roughly seven auctions before the actual first conversion. Legacy logs do not contain acknowledgements, and spending/word choice would change later play; this is not a proved match-winning counterfactual. Both revisions occurred before our first word, so the pending-word-only cache issue does not explain these two cases.

The live code recomputes bids when public unseen-letter information changes and advances its Monte Carlo random seed on every recomputation. Such new information can legitimately change value, but fresh sampling also introduces repricing noise. A narrow optional experiment will reuse sampling randomness within an auction while still respecting changed inventory and public information. Blindly raising all bids or forbidding every downward revision is not justified.

## Match45226: rating1949 to1913, minus36

We scored71 and placed fifth; the winner scored115. First purchase was round25, first word BOVINES36 around round49. We later played DECURY30 and AW5, ending with38 coins and no letters. No logged submission failures or analogous downward-bid crossing were found. This is a different pattern: slow acquisition/conversion with unspent funds, not the same cash-starvation outcome as45212.

## Match45219: 51-point gap to bot171

We scored88, placed second, and gained9 rating points. Bot171 scored139. We bought13 tiles and stopped buying after zero-based round40; the winner bought21 tiles, including12 in the final quarter.

Our words were BOWLIKE48 at24.297s, UNMATED30 at37.214s, and FLOE10 at68.069s. After UNMATED, rackEF and cash36 became EFLO and cash8 after purchasing L for18 and O for10. FLOE was available but held for roughly27 auctions, while the70% cap restricted bids to5.

The exact code conditions matter: starvation requires `balance < starveCoins`, with `starveCoins=8`, and even a starving rack only considers words of length5 or more. Cash8 and four-letter FLOE therefore miss BOTH gates. Raising the threshold to9 alone does not fix this case. A new isolated experiment uses threshold9 and minimum starvation length4; normal seven-letter preference remains unchanged. This is a testable correction, not yet evidence of improved live win rate.

GodOfThudner scored DEXTRAN45 at9.266s, QUARTO37 at54.483s, CRYPTO32 at58.957s, BLUSH20 at66.226s, and EF5 at68.270s. The51-point margin involved profitable shorter words and late acquisition throughput, not more seven-letter words in this match. Releasing FLOE earlier would provide18 coins but does not guarantee the later purchases or victory.

## Actions and memory

- Preserve the public records, local bid attempts, source hash and both winning/losing outcomes. Root artifacts are `match-45212-forensic.md`, `match-45226-public.json`, and `match-45212/45219/45226-joined-bids.json` under the active bot's `.runtime-odysseus` directory.
- The guarded immediate-completion experiment also lost:32 paired worlds, BASE95.72points/31.25%wins versus GUARDED87.56/18.75%. It stays off; preserve both the guarded and earlier unguarded failures.
- Structured execution telemetry distinguishes sent, acknowledged, received, rejected, unknown and locally cancelled actions. It was activated in the client-only release1563a4e after match45294 at01:12:32UTC, with WIN30 strategy unchanged. This will make future diagnoses more precise than the legacy log permits.
- The separate rare-letter premium candidate improved held-out simulated score/placement in two fields; live win-rate improvement remains unproved. It is not represented as a complete fix for these losses.
- Standing instructions are in `ODYSSEUS-STANDING-WORKFLOW.md`. The other authorized session has received these findings and owns any GitHub integration/push.
- Latest readiness target is9:30PMCentral, departure10:30PM, competition10:45PM. Verify repository visibility and the exact tournament release before submission. First place and indefinite wins have not been achieved or guaranteed.
