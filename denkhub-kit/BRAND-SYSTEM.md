# DenkHub Brand System

Guida completa per riprodurre lo stile DenkHub su qualsiasi progetto, pagina o componente.

---

## 1. DNA visivo

- **Sempre dark.** Sfondo nero `#000`, superfici grigio antracite `#1c1c1e`, testo bianco `#f5f5f7`.
- **Vetro + metallo soft.** Card con gradiente verticale scuro, bordi sottilissimi (0.09 opacity), blur di fondo.
- **Accento blu freddo** `#2997ff` come segnale operativo (link, focus, CTA secondarie). Mai come riempimento dominante.
- **Gerarchia tipografica netta.** Titoli grandi e compatti, corpo arioso, testi secondari in grigio `#86868b`.
- **Micro-interazioni leggere.** Hover con lieve cambio bordo/ombra, scale(0.97) su click, glow controllato.
- **Niente sfondi chiari.** Mai. Nemmeno per sezioni alternate (usare `--surface-color` o `--surface-elevated`).

---

## 2. Palette colori

### Base
| Token | Valore | Uso |
|-------|--------|-----|
| `--bg-color` | `#000000` | Sfondo pagina |
| `--surface-color` | `#1c1c1e` | Card, contenitori |
| `--surface-elevated` | `rgba(22,22,24,0.88)` | Header, elementi sovrapposti |
| `--text-primary` | `#f5f5f7` | Testo principale |
| `--text-secondary` | `#86868b` | Testo secondario, descrizioni |
| `--accent-color` | `#2997ff` | Link, focus, segnali |
| `--accent-soft` | `rgba(41,151,255,0.16)` | Background hover, selezioni |
| `--border-color` | `rgba(255,255,255,0.09)` | Bordi card, divisori |

### Gradient brand
| Token | Valore |
|-------|--------|
| `--gradient-start` | `#2997ff` |
| `--gradient-end` | `#8d7dff` |

Uso: testo gradient per hero/titoli chiave. Mai per sfondi interi.

### Colori di stato
| Stato | Colore testo | Colore base |
|-------|-------------|-------------|
| Success | `#63e388` | `#30d158` |
| Warning | `#ffbe56` | `#ff9f0a` |
| Danger | `#ff9f97` | `#ff3b30` |

### Ombre
| Token | Valore | Uso |
|-------|--------|-----|
| `--shadow-card` | `0 8px 20px rgba(0,0,0,0.18)` | Card normali |
| `--shadow-soft` | `0 14px 36px rgba(0,0,0,0.28)` | Card hover, modali |

---

## 3. Tipografia

### Font stack
- **Testo**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- **Monospace**: `ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace`
- **Nessun font custom.** Solo system stack.

### Scala titoli
| Classe | Dimensione | Peso | Interlinea | Spaziatura |
|--------|-----------|------|------------|------------|
| `headline-xl` | `clamp(2rem, 4vw, 3.25rem)` | 700 | 1.05 | -0.02em |
| `headline-lg` | `clamp(1.5rem, 2vw, 2.25rem)` | 600 | 1.1 | -0.02em |
| `lead-text` | ereditata | 400 | 1.55 | - |

### Regole
- Titoli: peso 600-700, letter-spacing negativo (stretto).
- Corpo: peso 400, line-height generoso (1.55-1.6).
- Testo secondario: colore `--text-secondary`, mai nero o bianco puro.
- Max width body text: `60ch`.

---

## 4. Spaziatura e raggi

### Scala spaziatura
| Token | Valore |
|-------|--------|
| `--space-xs` | `0.5rem` (8px) |
| `--space-sm` | `0.75rem` (12px) |
| `--space-md` | `1.25rem` (20px) |
| `--space-lg` | `2rem` (32px) |
| `--space-xl` | `4rem` (64px) |

### Border radius
| Token | Valore | Uso |
|-------|--------|-----|
| `--radius-sm` | `10px` | Input, code block |
| `--radius-md` | `14px` | Card piccole, alert |
| `--radius-lg` | `20px` | Card grandi, modali |
| `pill` | `999px` | Bottoni, badge, tab |

---

## 5. Layout

### Container
- Max width: `1520px`
- Padding inline: `clamp(0.75rem, 2.4vw, 1.25rem)`

### Header
- Posizione: `fixed`, full width, `z-index: 40`
- Altezza: `68px`
- Stile: `glass` (blur + bordo + ombra minima)

### Griglie
- `grid-2`: 2 colonne → 1 sotto 768px
- `grid-3`: 3 colonne → 2 sotto 1024px → 1 sotto 768px
- `grid-4`: 4 colonne → 2 sotto 1024px → 1 sotto 768px
- Gap standard: `--space-md`

### Background pagina
Sfondo nero con due elementi decorativi:
1. Radiali blu leggere (5% e 4% opacity) negli angoli
2. Griglia sottilissima 28px con linee al 18%/12% di `--surface-color`

---

## 6. Componenti

### Bottoni
```
Base: min-height 38px, rounded pill, border 1.5px, active scale(0.97)
```

| Variante | Background | Colore testo | Bordo |
|----------|-----------|-------------|-------|
| `btn-primary` | Gradiente chiaro (quasi bianco) | Nero `--bg-color` | 25% text-primary |
| `btn-secondary` | 10% accent su surface | `--accent-color` | 28% accent |
| `btn-ghost` | Trasparente | `--text-primary` | 80% border-color |
| `btn-danger` | 10% rosso | `#ff453a` | 28% rosso |

Taglie: `btn-sm` (32px), default (38px), `btn-lg` (46px).

### Campi input (`.field`)
- Background: 62% surface su nero
- Bordo: 1.5px solid border-color
- Focus: bordo 60% accent + box-shadow 4px 14% accent
- Padding: `0.65rem 0.85rem`
- Border-radius: `--radius-md` (14px)

### Card (`.surface-card`)
- Background: gradiente verticale da 84% surface/nero a surface puro
- Bordo: 1px solid border-color
- Border-radius: `--radius-lg` (20px)
- Top highlight: linea gradient 1px con accento al 22%/16%
- Hover: bordo accent 28% + shadow-soft
- `.no-hover` per disabilitare hover

### Pills / Badge (`.pill`)
- Padding: `0.22rem 0.6rem`
- Font: `0.72rem`, weight 500
- Border-radius: pill (999px)
- Varianti: `.pill-info`, `.pill-success`, `.pill-warn`, `.pill-danger`

### Glass (`.glass`)
- Background: `--surface-elevated`
- Blur: `18px`
- Bordo: 1px solid border-color
- Shadow: minima

### Tabella (`.table-clean`)
- Header: sticky, blur, uppercase 0.7rem, letter-spacing 0.14em
- Row: hairline border, hover con tinta accent 5%
- Min-width: 560px (scroll orizzontale su mobile)

---

## 7. Motion / Animazioni

### Durate
| Token | Valore | Uso |
|-------|--------|-----|
| fast | `120ms` | Click, scale |
| base | `160ms` | Hover, transizioni standard |
| soft | `200ms` | Fade, cambio colore |

### Regole
- Ogni animazione deve comunicare uno stato (loading, transizione, conferma, focus).
- Nessuna animazione decorativa lunga.
- Easing preferito: `ease` per transizioni semplici, `cubic-bezier(0.22, 1, 0.36, 1)` per slide.
- Bottoni: `scale(0.97)` su `:active`, `120ms`.
- Hover card: solo bordo/ombra, mai scale aggressivo.

---

## 8. Responsive

| Breakpoint | Cosa cambia |
|-----------|-------------|
| < 1024px | Grid 3/4 col → 2 col, split-layout → 1 col |
| < 768px | Tutti i grid → 1 col, btn min-height 42px, background grid 24px |

---

## 9. Copy / Tono di voce

- **Breve, operativo, concreto.** No fuffa, no buzzword.
- **Azione.** "Salva", "Invia", "Prenota", non "Procedi con l'operazione".
- **Italiano corretto.** Accenti (è, più, già, perché), niente apostrofi sostitutivi.
- **Numeri concreti.** "30 minuti", "24 ore", "2-4 settimane", non "velocemente".

---

## 10. Anti-deriva (errori da evitare)

- Mai sfondi chiari o bianchi
- Mai ombre neon o blur eccessivo
- Mai cambiare border-radius in modo casuale
- Mai sostituire il blu accent con colori esterni
- Mai tipografia display non-system
- Mai CTA senza hover/active state
- Mai trattini lunghi (—), usare il trattino normale (-)
- Mai apostrofi al posto degli accenti (è, non e')

---

## 11. Asset brand

| Asset | File | Uso |
|-------|------|-----|
| Logo wordmark | `assets/denkhub-logo.svg` | Header, footer (h: 28-36px) |
| Mark simbolo | `assets/denkhub-mark.svg` | Favicon, icona compatta |
| Favicon | `assets/denkhub-favicon.png` | Browser tab |

Il logo è sempre bianco su sfondo scuro. Per contesti chiari, applicare `filter: invert(1)`.

---

## 12. Come applicare

### HTML/PHP
1. Linka `tokens/denkhub-core.css`
2. Usa le classi semantiche: `container`, `surface-card`, `glass`, `btn`, `field`, `pill`
3. Mantieni la struttura: `container → surface-card → componenti interni`

### React/Next.js
1. Importa `denkhub-core.css` come stylesheet globale
2. Le classi DenkHub hanno priorità sulle utility Tailwind
3. Le utility possono aggiungersi, non sostituire

### Per agenti AI
Vedi `AGENT-INSTRUCTIONS.md` per istruzioni operative.
