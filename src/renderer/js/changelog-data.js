// Changelog entries — newest first
// Each entry: { version, date, title, changes: [{ category, items }] }
window.CHANGELOGS = [
  {
    version: '1.2.0',
    date: '2026-04-14',
    title: 'Integrazione Claude (MCP Server)',
    changes: [
      {
        category: 'Nuova funzionalità',
        items: [
          'Server MCP integrato: trascrivi file e consulta la cronologia direttamente da Claude',
          'Bottone "Aggiungi a Claude" nelle Impostazioni per configurazione one-click',
          'Bottone "Scollega" per rimuovere l\'integrazione',
          'Supporto cross-platform (macOS + Windows)',
        ]
      },
      {
        category: 'MCP Tools',
        items: [
          'transcribe — trascrivi qualsiasi file audio/video',
          'list_transcriptions — cerca nella cronologia',
          'get_transcription — testo completo con timestamp',
          'export_srt — esporta sottotitoli SRT',
          'list_models / download_model — gestisci modelli Whisper',
        ]
      },
      {
        category: 'Miglioramenti',
        items: [
          'Default automatico al modello Whisper più pesante installato',
          'Accetta file allegati in chat Claude (base64)',
        ]
      }
    ]
  },
  {
    version: '1.1.6',
    date: '2026-04-13',
    title: 'Fix trascrizione video lunghi',
    changes: [
      {
        category: 'Bug fix',
        items: [
          'Rimosso timeout 10 minuti sulla trascrizione: ora video di qualsiasi durata funzionano senza interruzione',
        ]
      },
      {
        category: 'Miglioramenti',
        items: [
          'Fix build su volumi exFAT (pulizia automatica file AppleDouble)',
          'Aggiornamento electron-builder a v26',
        ]
      }
    ]
  },
  {
    version: '1.1.5',
    date: '2026-04-11',
    title: 'Versione dinamica e fix UI',
    changes: [
      {
        category: 'Miglioramenti',
        items: [
          'Versione mostrata dinamicamente da package.json',
          'Fix vista cronologia e scroll trascrizione',
        ]
      }
    ]
  },
  {
    version: '1.1.4',
    date: '2026-04-10',
    title: 'Export SRT e miglioramenti UI',
    changes: [
      {
        category: 'Nuove funzionalità',
        items: [
          'Export SRT (sottotitoli) con segmentazione intelligente delle frasi',
          'Dropdown export unificato TXT/SRT sia in Trascrivi che in Cronologia',
          'Bottone "Installa ora" nell\'aggiornamento da impostazioni',
        ]
      },
      {
        category: 'Miglioramenti',
        items: [
          'Lista cronologia semplificata: click per aprire, solo bottone Elimina',
          'Export dialog più affidabile su macOS',
        ]
      }
    ]
  },
  {
    version: '1.1.3',
    date: '2025-04-10',
    title: 'Mini player persistente',
    changes: [
      {
        category: 'Nuove funzionalità',
        items: [
          'Mini player in stile Spotify fisso in basso durante la navigazione',
          'Controlli play/pausa, restart, avanti/indietro 10s e barra di seek',
          'Selettore velocità (1x, 1.5x, 2x) nel mini player',
          'Click sul nome audio per tornare alla sorgente',
        ]
      },
      {
        category: 'Correzioni',
        items: [
          'Audio trimmed ora caricato correttamente dalla cronologia',
          'Fix whisper-cli non trovato su macOS in modalità sviluppo',
        ]
      }
    ]
  },
  {
    version: '1.1.0',
    date: '2025-04-10',
    title: 'Trimmer audio, registrazione e editor parole',
    changes: [
      {
        category: 'Nuove funzionalità',
        items: [
          'Trimmer audio con visualizzazione waveform e zoom sulla timeline',
          'Registrazione audio: microfono, audio di sistema (Mac) e modalità mista',
          'Editor parole: modifica, unisci e dividi parole con preservazione dei timestamp',
          'Selezione multipla parole con Cmd/Ctrl+click e Shift+click',
        ]
      },
      {
        category: 'Miglioramenti',
        items: [
          'Waveform interattiva con barre RMS e zoom fino a 50x',
          'Conversione automatica registrazioni WebM in WAV per compatibilità player',
          'Nomi file leggibili per le registrazioni nel database',
          'Controlli velocità di riproduzione nel player',
        ]
      },
      {
        category: 'Correzioni',
        items: [
          'Risolto problema di sincronizzazione player con audio tagliato',
          'Risolto timestamp che andavano a caso dopo unione e divisione parole',
          'Risolto download modelli grandi che si bloccava',
          'Risolto eliminazione trascrizioni che falliva su alcune macchine',
        ]
      }
    ]
  },
  {
    version: '1.0.0',
    date: '2025-03-01',
    title: 'Prima release',
    changes: [
      {
        category: 'Funzionalità',
        items: [
          'Trascrizione locale con whisper.cpp — nessun dato inviato a server esterni',
          'Supporto modelli Whisper: tiny, base, small, medium, large',
          'Rilevamento automatico lingua o selezione manuale',
          'Cronologia trascrizioni con ricerca',
          'Esportazione trascrizioni in formato TXT',
          'Player audio integrato con evidenziazione parola per parola',
          'Aggiornamenti automatici con notifica in-app',
        ]
      }
    ]
  }
];
