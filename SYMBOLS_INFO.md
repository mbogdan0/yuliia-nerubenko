# Spine export notes

The asset layout and registration contract live in [AGENTS.md](AGENTS.md#symbols).
Use the current definitions as examples rather than copying a separate inventory.

After replacing an export, check it in both Gallery and Slot: the solid body
should stay centered, effects should have space, and texture edges should stay
clean during motion. Confirm fitting names against the skeleton's slots.

Change the PNG's alpha encoding and its atlas `pma` flag together. Adding
`pma:true` to a straight-alpha image without re-exporting it can create dark edges.

Open asset issues and measured loading costs are recorded in
[the performance review](PERFORMANCE_REVIEW.md#remaining-limits).
