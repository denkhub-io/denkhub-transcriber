# DenkHub Kit - Istruzioni per Agenti AI

Quando devi creare UI, pagine web, componenti o qualsiasi elemento visivo nello stile DenkHub, segui queste istruzioni.

---

## Setup rapido

1. Linka il CSS: `<link rel="stylesheet" href="denkhub-core.css">`
2. Usa le classi semantiche DenkHub (non reinventare stili)
3. Consulta `BRAND-SYSTEM.md` per ogni dubbio

---

## Le 10 regole da non violare mai

1. **Sfondo sempre nero** `#000000`. Mai sfondi chiari.
2. **Testo bianco** `#f5f5f7` per testo principale, `#86868b` per secondario.
3. **Accento blu** `#2997ff` solo per link, focus, CTA secondarie. Mai dominante.
4. **Font system stack** `-apple-system, BlinkMacSystemFont, ...`. Nessun font custom.
5. **Border-radius** `10/14/20px` per elementi, `999px` per bottoni/pill.
6. **Bordi sottili** `rgba(255,255,255,0.09)`. Mai bordi spessi o colorati.
7. **Hover leggeri.** Cambio bordo/ombra, mai scale aggressivo su card.
8. **Italiano corretto.** Accenti (è, più, già, perché), niente apostrofi sostitutivi, niente trattini lunghi.
9. **Copy breve e concreto.** Azione diretta, numeri reali, zero fuffa.
10. **Mobile-first.** Griglie che collassano, bottoni touch-friendly (min 42px mobile).

---

## Palette da usare

```css
/* Copia queste variabili nel tuo :root */
--bg-color:        #000000;
--surface-color:   #1c1c1e;
--surface-elevated: rgba(22, 22, 24, 0.88);
--text-primary:    #f5f5f7;
--text-secondary:  #86868b;
--accent-color:    #2997ff;
--accent-soft:     rgba(41, 151, 255, 0.16);
--border-color:    rgba(255, 255, 255, 0.09);
--gradient-start:  #2997ff;
--gradient-end:    #8d7dff;
```

---

## Pattern HTML da seguire

### Pagina base
```html
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="denkhub-core.css">
</head>
<body>
  <header class="glass" style="position:fixed;inset:0 0 auto 0;z-index:40;height:68px;border-bottom:1px solid var(--border-color);">
    <div class="container" style="display:flex;align-items:center;height:100%;">
      <!-- logo + nav -->
    </div>
  </header>
  <div style="padding-top:68px;">
    <div class="container">
      <!-- contenuto -->
    </div>
  </div>
</body>
</html>
```

### Card
```html
<div class="surface-card" style="padding:1.25rem;">
  <h3>Titolo</h3>
  <p style="color:var(--text-secondary);">Descrizione</p>
</div>
```

### Bottone primario
```html
<button class="btn btn-primary">Azione</button>
```

### Campo input
```html
<label class="field-label">Email</label>
<input class="field" type="email" placeholder="nome@azienda.it">
```

### Pill/badge
```html
<span class="pill pill-info">Attivo</span>
<span class="pill pill-success">Completato</span>
<span class="pill pill-warn">In attesa</span>
<span class="pill pill-danger">Errore</span>
```

### Tabella
```html
<table class="table-clean">
  <thead><tr><th>Colonna</th></tr></thead>
  <tbody><tr><td>Dato</td></tr></tbody>
</table>
```

---

## Testo gradient (per titoli hero)
```html
<h1 class="headline-xl">
  Testo normale <span class="text-gradient">Testo gradient</span>
</h1>
```

---

## Background pagina standard
Il body deve avere queste radiali + griglia:
```css
body {
  background: #000;
  background-image:
    radial-gradient(circle at 6% 0%, rgba(41,151,255,.05), transparent 34%),
    radial-gradient(circle at 100% 6%, rgba(41,151,255,.04), transparent 42%),
    linear-gradient(to bottom, rgba(28,28,30,.18) 1px, transparent 1px),
    linear-gradient(to right, rgba(28,28,30,.12) 1px, transparent 1px);
  background-size: auto, auto, 100% 28px, 28px 100%;
}
```

---

## Checklist qualità

Prima di consegnare qualsiasi output visivo DenkHub, verifica:

- [ ] Sfondo nero, nessun elemento chiaro
- [ ] Font system stack, nessun font custom caricato
- [ ] Colori solo dalla palette (nessun grigio inventato, nessun blu diverso)
- [ ] Border-radius coerenti (10/14/20/999)
- [ ] Bottoni con hover e active state
- [ ] Testo italiano con accenti corretti
- [ ] Responsive: testato a 768px e 1024px
- [ ] Copy breve, concreto, senza fuffa
- [ ] Logo DenkHub presente (header e/o footer)
- [ ] Nessun trattino lungo, nessun apostrofo sostitutivo

---

## File di riferimento

| File | Cosa contiene |
|------|---------------|
| `tokens/denkhub.tokens.json` | Tutti i valori come JSON strutturato |
| `tokens/denkhub-core.css` | CSS completo con variabili e classi |
| `BRAND-SYSTEM.md` | Documentazione completa del brand |
| `assets/` | Logo, mark, favicon |

## Reference live
- https://denkhub.io (sito pubblico)
- https://manager.denkhub.io (app gestionale)
