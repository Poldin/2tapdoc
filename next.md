# Cosa viene dopo

Questo file sta accanto a `core.md`. Le decisioni sotto sono già prese: è l’ordine con cui si costruisce adesso. `core.md` resta il confine del prodotto e non si riscrive a ogni passo.

Mentre si implementa, le note vanno qui, sotto la decisione a cui appartengono: che cosa è atterrato, che cosa è cambiato rispetto a quanto scritto, che cosa resta aperto. Una nota dice anche dove vive nel codice, se il punto non è più solo una decisione.

## Ordine

1. Funzioni certe e `chat_events`.
2. I file dei tool.
3. Il tool di render e il catalogo dei componenti.
4. Log e metriche.
5. Il router dei tool e la memoria, quando ci sono dati veri su cui provarli.

## 1. eve come ispirazione, non come fondamento

Da eve si prendono le idee: sessioni dell’agente, chat con più persone e più bot, sveglie, task durevoli, memoria, tracing.

La base resta questa. Supabase con Row Level Security. Funzioni certe per ogni scrittura. Il canale SQL in sola lettura. `chat_events` come unica fonte della cronologia. A un bot o a una sandbox non si consegna mai una chiave del database.

### Note

La conversazione è il gruppo che c’era già in `chats`, `chat_participants` e `chat_events`. L’app ora lo tratta così.

Un messaggio di una persona sveglia tutti i bot solo se in chat ce n’è uno. Se ce n’è più di uno, sveglia soltanto i bot nominati con `@`: il compositore scrive gli id in `payload.mentions`, e il trigger non legge il testo. Un messaggio senza `@`, in quel caso, non interrompe i bot che stanno scrivendo.

In chat si aggiunge un collega dello stesso studio, o un bot proprio. Una persona esce da sola, e l’ultima resta. Il bot agisce ancora con i permessi di chi lo possiede. Il titolo della conversazione non segue più il nome del bot.

Nel thread si vede chi ha scritto. La traccia di contesto è per bot (`chat_context` su `chat_id, bot_id`), e al modello i messaggi degli altri arrivano col nome. Una persona risulta in attesa solo se il messaggio riguarda quel bot.

## 2. Tool

Un file per tool: una descrizione, uno schema di input Zod e un `execute`. Ogni tool ha una regola di approvazione. Al modello arriva meno di quello che vede la UI. I tool usati di rado restano nascosti finché il modello non li cerca.

### Note

Ancora da fare.

## 3. Tooling dinamico

Prima si filtrano i tool per ruolo e permessi dell’utente. Poi un modello piccolo e aperto, come Qwen o Llama, oppure embeddings più un reranker, sceglie i 3 tool migliori con una probabilità, usando le richieste passate di quell’utente. I tool nascosti sono il ripiego. Ogni scelta si registra accanto al tool che è stato davvero usato.

### Note

Ancora da fare.

## 4. Misurare e fare A/B test

Si prova offline su campioni anonimizzati, e online marcando ogni sessione con la sua variante. Si tengono la hit rate della top 3, i ripieghi, le approvazioni rifiutate, i turni per task, la latenza e il costo per task. Tutto resta legato alle due misure di `core.md`: abbassare i costi operativi e aumentare il valore concretizzato.

### Note

Ancora da fare.

## 5. Memoria

Slot separati per utente — alimentano anche il router — per clinica e per bot. Lo scope arriva dall’auth già verificata. Ogni turno fa recall, poi i tool, poi capture. Lo stato della sessione sta fuori dalla memoria. I fatti del paziente non entrano in memoria: restano in Supabase, dietro la Row Level Security. Se si può, il provider di memoria è custom su Postgres, così anche la memoria cade sotto la RLS.

### Note

Ancora da fare.

## 6. UI generativa nella chat

I tool sui dati restano separati da un solo tool di render, che disegna UI inline da un catalogo fisso di componenti, all’approccio json-render. I bottoni chiamano le funzioni certe direttamente, con i permessi dell’utente: il click è l’approvazione. Ogni card si salva in `chat_events`. Ogni card ha anche una versione in testo o con reply button, per WhatsApp.

### Note

Ancora da fare.
