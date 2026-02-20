# Rétouch

A canvas-based image editor library.

## Install

```bash
npm install retouch
```

## Usage

```ts
import { Retouch } from "retouch";

const editor = new Retouch({
  target: "#editor",
  width: 800,
  height: 600,
});

// When done:
editor.destroy();
```

## Development

```bash
pnpm install
pnpm dev          # Start dev server with live demo
pnpm test         # Run tests
pnpm build        # Build for production
pnpm check        # Lint and format check
pnpm typecheck    # Type check
```

## License

MIT
