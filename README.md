# Centro Sicurezza Card

Porta blindata (o qualsiasi serratura) + sensori d'allarme **in una card sola**, al posto di una vista fatta di tante `mushroom-template-card` separate ognuna col suo CSS a mano.

## Cosa fa

- **Blocca / Sblocca / Apri** la serratura (`lock.*`), ognuno con una conferma prima di eseguire
- Mostra lo **stato dell'anta** (aperta/chiusa) se hai un sensore dedicato
- Mostra la **batteria** della serratura, se disponibile
- **Panoramica sensori**: incolli una lista di sensori (finestre, volumetrici, vibrazione...) e la card mostra "✅ Tutto chiuso" o "🚨 N aperti/attivi" — toccando si apre l'elenco di quali
- **Ultime attività**: storico degli ultimi 7 giorni della serratura dal logbook di Home Assistant
- Colore e animazione della card cambiano da soli: verde (tutto ok), giallo (sbloccata / sensore attivo), rosso lampeggiante (anta aperta), giallo veloce (bloccaggio/sbloccaggio in corso)

## Configurazione

- Nome
- Serratura (`lock.*`) — opzionale: senza, i tasti blocca/sblocca/apri restano nascosti
- Sensore anta aperta/chiusa (`binary_sensor.*`) — opzionale
- Sensore batteria (`sensor.*`) — opzionale
- Altri sensori da riepilogare: un'entità per riga nella casella di testo, es.
  ```
  binary_sensor.finestra_sala|Finestra Sala
  binary_sensor.volumetrico_sala
  ```
  Il nome dopo `|` è facoltativo — senza, usa il friendly name di Home Assistant.

I campi entità hanno un **campo di ricerca che filtra** mentre scrivi, non un menu a tendina lunghissimo.

## Installazione (HACS)

1. HACS → Frontend → menu (⋮) → Repository personalizzate → aggiungi `https://github.com/cristianwebonline/ha-centro-sicurezza-card` come "Dashboard"
2. Installa "Centro Sicurezza Card"
3. Aggiungi una card, tipo `Custom: Centro Sicurezza Card`
