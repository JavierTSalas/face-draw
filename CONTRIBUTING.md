# Contributing

New effects and games are the best contributions. Each one is a single folder,
so pull requests rarely conflict.

1. `npm install && npm run dev`
2. Copy `src/effects/original` (or any effect) to `src/effects/<your-id>/`.
3. Read [docs/ADDING_EFFECTS.md](docs/ADDING_EFFECTS.md) for the API.
4. Test on a phone (`npm run dev:phone`) with `?hud` to check the frame rate.
5. `npm run build` must pass. Open a pull request with a screenshot or clip.

Core changes (engine, renderer, tracking) are welcome too. Please keep the main
thread free of per-frame allocations and measure before and after.
