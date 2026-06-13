# Exploit Gemeni Angular

Frontend Angular pour tester le proxy Gemini.

## Run local

```bash
npm install
npm start
```

Le frontend demarre sur `http://127.0.0.1:4200`.

## API proxy

Les appels suivants passent par `proxy.conf.json` vers le backend local:

- `/api/*`
- `/health`

Le backend attendu est `http://localhost:5055`.

## Build

```bash
npm run build
```

## Test

```bash
npm test
```
