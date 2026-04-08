# DenkHub Kit v2.0

Kit grafico e istruzioni operative per applicare lo stile DenkHub a qualsiasi progetto.
Questo è il single source of truth per il brand system DenkHub.

## Struttura

```
denkhub-kit/
├── README.md                    # Questo file
├── BRAND-SYSTEM.md              # Regole complete di stile (la "bibbia")
├── AGENT-INSTRUCTIONS.md        # Istruzioni per agenti AI
├── tokens/
│   ├── denkhub.tokens.json      # Token strutturati (colori, spazi, raggi, type)
│   └── denkhub-core.css         # CSS pronto all'uso con tutte le classi
├── assets/
│   ├── denkhub-logo.svg         # Logo wordmark orizzontale (bianco)
│   ├── denkhub-mark.svg         # Simbolo/mark geometrico (bianco)
│   └── denkhub-favicon.png      # Favicon PNG
```

## Come usare

1. **Progetto nuovo**: copia `tokens/denkhub-core.css` nel progetto e linkalo nell'HTML
2. **Agente AI**: fornisci `AGENT-INSTRUCTIONS.md` come contesto
3. **Verifica stile**: confronta con `BRAND-SYSTEM.md` per ogni decisione visiva
4. **Token programmatici**: usa `tokens/denkhub.tokens.json` per generare CSS/Tailwind/variabili

## Reference live
- Sito pubblico: https://denkhub.io
- App gestionale: https://manager.denkhub.io
