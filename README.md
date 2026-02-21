# PNG Prompt Extractor

Webapp minimal che:
- carica uno o più PNG
- legge i chunk testuali (tEXt / zTXt / iTXt)
- prova a ricostruire il JSON ComfyUI (raw_workflow) e a estrarre il prompt positivo
- mostra il prompt in un box copiabile + "Copia tutti"

## Requisiti
- Node.js 18+ (consigliato 20+)
- Browser moderno (Chrome/Edge consigliati per DecompressionStream)

## Avvio in sviluppo
```bash
npm install
npm run dev
```

Poi apri l'URL mostrato in console (di solito http://localhost:5173).

## Build produzione
```bash
npm run build
npm run preview
```


## Note
- Se un metadata contiene una stringa tipo `{ "prompt": "..." }` (wrapper JSON), viene ignorata e **non mostrata**.
- La lista è compatta e a **2 colonne** su schermi grandi; ogni card mostra una **preview** a sinistra.
