# DenkHub Transcriber

**Trascrivi audio e video. Sul tuo computer. Gratis.**

DenkHub Transcriber è un'applicazione desktop che converte la voce in testo usando l'intelligenza artificiale, senza inviare nulla a server esterni. Tutto avviene in locale sul tuo computer.

Usa [whisper.cpp](https://github.com/ggerganov/whisper.cpp), la versione nativa in C++ del modello [Whisper](https://github.com/openai/whisper) di OpenAI — lo stesso motore usato dai migliori servizi di trascrizione, ma eseguito direttamente sulla tua macchina.

[Scarica per macOS](https://github.com/denkhub-io/denkhub-transcriber/releases/latest) | [Scarica per Windows](https://github.com/denkhub-io/denkhub-transcriber/releases/latest)

---

## Perché DenkHub Transcriber

- **100% locale e privato** — nessun dato lascia il tuo computer. Nessun account, nessuna API key, nessun abbonamento.
- **Gratis e open source** — scarichi, installi, usi. Fine.
- **Funziona offline** — una volta scaricato il modello AI, non serve internet.
- **5 modelli a scelta** — dal velocissimo Tiny (75 MB) al precisissimo Large (3.1 GB). Scarichi solo quelli che ti servono.
- **Supporta audio e video** — MP3, WAV, OGG, M4A, OPUS, MP4, MOV, AVI, MKV. Anche i messaggi vocali di WhatsApp.
- **Multilingua** — italiano, inglese, francese, spagnolo, tedesco e rilevamento automatico.

---

## Funzionalità

### Trascrizione con timestamp parola per parola
Ogni parola è sincronizzata con l'audio. Clicca su una parola per saltare a quel punto della registrazione.

### Player audio integrato
Riproduci l'audio direttamente nell'app con velocità variabile (1x, 1.5x, 2x).

### Modifica inline
Click destro su qualsiasi parola per correggerla. Undo/Redo con Cmd+Z / Ctrl+Z.

### Cronologia con ricerca full-text
Tutte le trascrizioni vengono salvate localmente e sono ricercabili per contenuto.

### Esportazione
Copia il testo negli appunti o esporta come file .txt.

---

## Modelli disponibili

| Modello | Dimensione | Velocità | Precisione | Consigliato per |
|---------|-----------|----------|------------|-----------------|
| Tiny | 75 MB | Velocissimo | Bassa | Test rapidi, bozze |
| Base | 142 MB | Veloce | Discreta | Uso quotidiano |
| Small | 466 MB | Medio | Buona | Buon compromesso |
| Medium | 1.5 GB | Lento | Alta | Contenuti importanti |
| Large | 3.1 GB | Molto lento | Massima | Quando serve il meglio |

I modelli vengono scaricati al primo avvio tramite un wizard guidato. Puoi aggiungerne o rimuoverne in qualsiasi momento.

---

## Installazione

### macOS (Apple Silicon)
1. Scarica il file `.dmg` dalla [pagina Releases](https://github.com/denkhub-io/denkhub-transcriber/releases/latest)
2. Apri il DMG e trascina l'app nella cartella Applicazioni
3. **Importante:** al primo avvio, fai click destro sull'app > "Apri" (necessario perché l'app non è firmata con certificato Apple)

**Requisiti:** macOS 12+, Apple M1/M2/M3/M4, almeno 4 GB di RAM

### Windows
1. Scarica il file `.exe` dalla [pagina Releases](https://github.com/denkhub-io/denkhub-transcriber/releases/latest)
2. Esegui l'installer (doppio click)
3. Se Windows SmartScreen mostra un avviso, clicca "Ulteriori informazioni" > "Esegui comunque"

**Requisiti:** Windows 10+ 64-bit, almeno 4 GB di RAM

---

## Come funziona

1. **Trascina** un file audio o video nella finestra (o clicca per selezionarlo)
2. **Scegli** il modello AI e la lingua
3. **Premi** Trascrivi
4. **Risultato** — testo interattivo con sincronizzazione parola per parola, player audio, esportazione

Al primo avvio, un wizard ti guida nella configurazione: dove salvare i modelli, dove salvare le trascrizioni, quale modello scaricare.

---

## Sviluppo

```bash
# Clona il repository
git clone https://github.com/denkhub-io/denkhub-transcriber.git
cd denkhub-transcriber

# Installa le dipendenze
npm install

# Avvia in modalità sviluppo
npm start

# Build per macOS
npm run build:mac

# Build per Windows
npm run build:win
```

### Stack tecnologico
- **Electron** — shell desktop
- **whisper.cpp** (via nodejs-whisper) — motore di trascrizione
- **FFmpeg** — conversione audio/video
- **SQLite** (better-sqlite3) — database locale con ricerca full-text (FTS5)
- **HTML/CSS/JS** — interfaccia utente (nessun framework)

---

## Licenza

MIT License — vedi [LICENSES.md](LICENSES.md) per i dettagli sulle licenze di tutti i componenti utilizzati.

---

## Crediti

Questo progetto è possibile grazie a:

- [OpenAI Whisper](https://github.com/openai/whisper) — il modello di riconoscimento vocale
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) di Georgi Gerganov — la reimplementazione C++ che rende tutto questo veloce e portatile
- [Electron](https://www.electronjs.org/) — il framework desktop
- [FFmpeg](https://ffmpeg.org/) — conversione multimediale
- La comunità open source che rende tutto questo possibile

---

Fatto con cura da [DenkHub](https://github.com/denkhub-io).
