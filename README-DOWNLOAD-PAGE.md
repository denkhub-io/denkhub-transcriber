# DenkHub Transcriber — Guida per la pagina di download

Questo documento è destinato a Claude (o a chi creerà la pagina web di download). Contiene tutte le informazioni necessarie per creare una landing page efficace per il prodotto.

---

## Cos'è DenkHub Transcriber

Un'applicazione desktop per trascrivere audio e video **completamente in locale**, senza inviare dati a server esterni. Usa il motore Whisper (OpenAI) compilato nativamente sul computer dell'utente.

### Punti chiave per il marketing

- **100% locale e privato** — nessun dato lascia il computer. Nessun account, nessuna API key, nessun abbonamento.
- **Gratis e open source** — scarichi, installi, usi. Fine.
- **Trascrizione di qualità professionale** — lo stesso motore Whisper usato da OpenAI, compilato in C++ per la massima velocità.
- **Funziona offline** — una volta scaricato il modello, non serve internet.
- **Multilingua** — italiano, inglese, francese, spagnolo, tedesco, e auto-detect.
- **Modelli a scelta** — dal velocissimo Tiny (75 MB) al precisissimo Large (3.1 GB). Scarichi solo quelli che ti servono.
- **Cronologia e ricerca** — tutte le trascrizioni vengono salvate e sono ricercabili per contenuto.
- **Modifica inline** — click destro su qualsiasi parola per correggerla. Undo/Redo con Cmd+Z.
- **Player integrato** — riproduci l'audio con velocità 1x, 1.5x, 2x. Clicca su una parola per saltare a quel punto.
- **Esporta in .txt** — esporta la trascrizione come file di testo.

---

## Formati supportati

### Audio
MP3, WAV, OGG, M4A, OPUS

### Video
MP4, MOV, AVI, MKV (l'audio viene estratto automaticamente)

---

## Modelli disponibili

| Modello | Dimensione | Velocità | Precisione | Consigliato per |
|---------|-----------|----------|------------|-----------------|
| Tiny | 75 MB | Velocissimo | Bassa | Test rapidi, bozze |
| Base | 142 MB | Veloce | Discreta | Uso quotidiano leggero |
| Small | 466 MB | Medio | Buona | Buon compromesso |
| Medium | 1.5 GB | Lento | Alta | Contenuti importanti |
| Large | 3.1 GB | Molto lento | Massima | Quando serve il meglio |

L'utente sceglie quali modelli scaricare al primo avvio. Può aggiungerne o rimuoverne in qualsiasi momento dall'app.

---

## Requisiti di sistema

### macOS (Apple Silicon)
- macOS 12 Monterey o successivo
- Processore Apple M1, M2, M3 o M4
- Almeno 4 GB di RAM (8 GB consigliati per modelli grandi)
- Spazio disco: 124 MB per l'app + spazio per i modelli scelti

### Windows
- Windows 10 o successivo (64-bit)
- Almeno 4 GB di RAM
- Spazio disco: 100 MB per l'app + spazio per i modelli scelti

---

## File da mettere in download

### macOS
- **Nome file:** `DenkHub Transcriber-1.0.0-arm64.dmg`
- **Dimensione:** 124 MB
- **Tipo:** DMG (Apple Disk Image) per Apple Silicon
- **Installazione:** apri il DMG, trascina l'app nella cartella Applicazioni

### Windows
- **Nome file:** `DenkHub Transcriber Setup 1.0.0.exe`
- **Dimensione:** 100 MB
- **Tipo:** Installer NSIS (one-click)
- **Installazione:** doppio click sull'exe, si installa automaticamente

---

## Flusso utente (per spiegarlo nella pagina)

1. **Scarica** il file per il tuo sistema operativo
2. **Installa** (trascina nelle Applicazioni su Mac, doppio click su Windows)
3. **Configurazione guidata** — al primo avvio, un wizard ti chiede:
   - Dove salvare i modelli
   - Dove salvare le trascrizioni
   - Quale modello scaricare (consigliato: Base, 142 MB)
4. **Trascrivi** — trascina un file audio o video, scegli modello e lingua, premi Trascrivi
5. **Risultato** — testo con sincronizzazione parola per parola, player audio integrato, esporta come .txt

---

## Note per il design della pagina

- Il prodotto fa parte dell'ecosistema **DenkHub** — usare il design system DenkHub (sfondo nero, accent blu #2997ff, font system)
- Hero section con headline forte tipo: "Trascrivi audio e video. Sul tuo computer. Gratis."
- Sezione feature con icone
- Tabella modelli
- Due bottoni di download ben visibili (macOS / Windows)
- Sezione FAQ opzionale (è gratis? sì. Serve internet? Solo per scaricare i modelli. I miei dati sono al sicuro? Tutto resta sul tuo computer.)
- Screenshot dell'app in azione (la UI è dark, si presta bene su sfondo nero)

---

## Testi suggeriti

### Headline
"Trascrivi audio e video. Sul tuo computer. Gratis."

### Sottotitolo
"DenkHub Transcriber usa l'intelligenza artificiale di Whisper per convertire la voce in testo, senza inviare nulla a server esterni. Scarica, installa, trascrivi."

### CTA
"Scarica per macOS" / "Scarica per Windows"

### Feature bullets
- Trascrizione locale al 100% — i tuoi dati non lasciano mai il computer
- 5 modelli AI a scelta — dal veloce al preciso
- Funziona offline dopo il primo setup
- Cronologia con ricerca full-text
- Player audio con velocità variabile
- Modifica le parole con un click destro
- Esporta come file di testo
- Supporta audio, video e messaggi vocali
- Multilingua con auto-detect

---

## Nota importante per l'installazione

### macOS — "Apple non è in grado di verificare"
Al primo avvio macOS mostra un avviso perché l'app non è firmata con un certificato Apple. È normale per app indipendenti. Per aprirla:

1. **Non** fare doppio click sull'app
2. Fai **click destro** (o Ctrl+click) su DenkHub Transcriber
3. Seleziona **"Apri"** dal menu
4. Clicca **"Apri"** nel dialog di conferma
5. Da quel momento si apre normalmente

In alternativa, apri il Terminale ed esegui:
```
xattr -cr "/Applications/DenkHub Transcriber.app"
```

### Windows — SmartScreen "app non riconosciuta"
Windows potrebbe mostrare un avviso blu SmartScreen. Per procedere:

1. Clicca su **"Ulteriori informazioni"**
2. Clicca su **"Esegui comunque"**

Questo avviso appare per tutte le app nuove non firmate digitalmente e sparisce con il tempo.

---

### FAQ
**È davvero gratis?**
Sì, completamente. Nessun abbonamento, nessun limite di utilizzo.

**Serve una connessione internet?**
Solo per scaricare l'app e i modelli. Dopo, funziona completamente offline.

**I miei dati sono al sicuro?**
Tutto viene elaborato localmente sul tuo computer. Nessun audio o testo viene inviato a server esterni.

**Quanto è precisa la trascrizione?**
Dipende dal modello scelto. Il modello Large offre precisione paragonabile ai servizi cloud, il modello Tiny è più veloce ma meno preciso.

**Posso trascrivere i messaggi vocali di WhatsApp?**
Sì, supporta il formato .opus usato da WhatsApp.

**Quanto tempo ci vuole a trascrivere?**
Dipende dalla durata del file e dal modello. Un audio di 5 minuti con il modello Base richiede circa 1 minuto.

**Perché macOS/Windows mostrano un avviso di sicurezza?**
L'app non è ancora firmata con un certificato digitale. È completamente sicura — il codice è open source e verificabile. Segui le istruzioni sopra per aprirla.
