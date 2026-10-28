# 2tapdoc

2tapdoc è un Grokbot per il mondo medico: un’infrastruttura di AI e database che rende immediata l’interazione tra dottori, assistenti, segreteria, amministrazione e il sistema.

Il prodotto nasce da una pretesa precisa. L’AI è la prima interfaccia. La UI viene dopo, e serve a rendere visibile, confermabile e correggibile ciò che l’AI ha già capito e proposto. Ogni schermata esiste perché un’interazione in linguaggio naturale ha bisogno di un appoggio, non perché il flusso parta dai form.

## A chi parla

Il sistema parla con le persone che lavorano in una clinica, ciascuna dentro il proprio ruolo. Dottore, assistente, segreteria e amministrazione sono esempi di ruoli che una clinica può definire: sotto l’admin, i sottoinsiemi sono suoi e si possono cambiare. Ogni persona vede e muove solo i dati che il suo ruolo, in quella clinica, le lascia raggiungere.

## Due misure di successo

Il sistema è buono quando fa due cose insieme, e le fa sempre meglio:

- **abbassa i costi operativi** — meno passaggi, meno trascrizioni, meno tempo perso a cercare, compilare e riconciliare
- **aumenta il valore concretizzato** — più lavoro utile portato a termine, con meno attrito tra intenzione e risultato

Efficienza senza utilità è risparmio vuoto. Utilità senza efficienza non scala. Entrambe vanno misurate sul lavoro reale di studio, non sulla quantità di funzioni esposte.

## Come è fatto

Due strati, con compiti diversi.

### Database

I dati vivono in Supabase, in uno schema strutturato e iper sicuro.

Lo schema è esplicito: entità, relazioni e vincoli sono nel database, non nascosti nel prompt. La sicurezza è nel database: ogni riga è raggiungibile solo dall’utenza che ha titolo a vederla, con isolamento enforced a livello di Postgres (Row Level Security), non solo nel client. Autenticazione, autorizzazione e audit stanno vicini ai dati.

Le migration non stanno nel repository. La storia dello schema è tracciata in Supabase, e da lì si legge e si applica.

### Due modi di toccare i dati

**Funzioni certe.** Le azioni che cambiano lo stato del sistema passano da funzioni con un contratto preciso: input validato, effetto deterministico, esito verificabile. Prenotare, aggiornare, assegnare, chiudere, notificare: se il sistema dice di averlo fatto, lo ha fatto, e si può ricostruire come. L’AI propone e invoca; non improvvisa l’effetto.

**Lettura che spazia.** Per capire cosa serve in quel momento, l’AI può muoversi nel database e prendere i dati — sempre quelli associati all’utenza — che sono più utili alla richiesta. La lettura non è un menu fisso di query precotte. È una ricerca nel perimetro consentito, guidata dal compito.

La certezza sta nell’esecuzione. La libertà sta nella lettura. Le due cose non si scambiano di posto: un’azione non è “abbastanza sicura” perché il modello l’ha descritta bene, e una risposta non è utile se l’AI può vedere solo le tre tabelle previste dal form.

## Accesso, cliniche e canale dell’AI

L’utenza è la persona, e la persona è una mail. La clinica è il tenant: più utenze condividono gli stessi dati di clinica, e due utenze della stessa clinica non vedono le stesse cose. In ogni clinica c’è sempre il ruolo `admin`, e almeno una persona lo ricopre. Quel ruolo non si cancella e non si svuota. Gli altri ruoli li crea la clinica: nome, persone, permessi. I permessi sono un catalogo del sistema, perché il database deve sapere che cosa sbloccano; la clinica decide quale ruolo riceve quali chiavi. L’admin della clinica le ha tutte. Un super system admin sta fuori da questi ruoli, nella tabella `platform_admins`: è l’utenza di chi gestisce la piattaforma, vede le cliniche e non sostituisce l’admin interno.

L’autorizzazione vive in Postgres, con la Row Level Security, e si legge da `memberships` e dai permessi del ruolo. Non si legge da metadati che l’utente può modificare. I controlli stanno in funzioni nello schema `private`, fuori dall’API, e rispondono solo per l’utente della richiesta. Le tabelle esposte sono `profiles`, `clinics`, `clinic_roles`, `permissions`, `clinic_role_permissions`, `memberships`, `platform_admins`, `patients`, `doctors`, `clinical_objects`, `appointments`, `appointment_doctors`, `appointment_objects`, `appointment_patients`, `bots`, `chats`, `chat_participants`, `chat_events`.

Lo strumento dell’AI, bash compreso, non riceve la password del database né la chiave che scavalca la Row Level Security. A ogni chiamata lo strumento apre una transazione, ci mette i claim già verificati di quell’utente, scende al ruolo `authenticated`, esegue e chiude. La lettura è SQL libero dentro quel canale, e il ruolo con cui gira può solo leggere. Le scritture passano dalle funzioni certe: rieseguono il controllo del permesso, oppure girano con l’identità di chi le chiama. Così A, admin della clinica ABBA, e B, con un ruolo più stretto, usano lo stesso bash e la stessa query: a B non arrivano le righe riservate ad A. Se a B va nascosto un campo di una riga per il resto visibile, quel campo sta in una vista o in una tabella col suo permesso. Un connettore o un MCP che porta una chiave condivisa non distingue A da B, e a B non si dà.

## Pazienti e agenda

Il paziente appartiene alla clinica. Nome, cognome, data di nascita, telefono, email, codice fiscale e una nota operativa stanno sulla scheda. La stessa persona in due centri sono due schede. Il contenuto clinico, quando arriverà, avrà tabella e permesso suoi. Le chiavi sono `patients.read` e `patients.write`: l’admin le ha già, gli altri ruoli solo se la clinica gliele assegna.

L’agenda è il tempo di un dottore o di un oggetto clinico. Il dottore è una figura della clinica (`doctors`), non un’utenza: la segretaria è un’utenza e non è un dottore, e un dottore può esistere anche senza login. Se quel dottore ha un login, `doctors.user_id` punta all’utenza, ed è unica dentro la clinica. Un’utenza senza quella riga non è un dottore. Ci compaiono appuntamenti e blocchi. L’appuntamento ha inizio e fine, almeno un paziente, i dottori che servono e, se serve, un oggetto clinico (`clinical_objects`: `id`, `name`, `jsonb`). Il blocco occupa il tempo di un dottore o di un oggetto clinico e non vieta di scrivere un appuntamento sopra. Due appuntamenti sulla stessa ora restano validi: identificarli, evidenziarli e allertarli sarà un servizio, più avanti. Oggetti clinici, appuntamenti e blocchi stanno sotto `agenda.read` e `agenda.write`.

## Chat, bot e alert del server

Ogni persona può aprire quante chat vuole. In una chat stanno più persone e più bot. Chi apre la chat ne sceglie il simbolo: un cerchio del colore scelto e un’emoji che non è una faccia, da un insieme fissato. Il bot appartiene a chi lo crea: ha un nome, un colore dello stesso insieme (`ink`, `navy`, `blue`, `sky`, `indigo`, `teal`, `mint`, `green`, `forest`, `lime`, `olive`, `amber`, `orange`, `brown`, `coral`, `red`, `rose`, `wine`, `plum`, `violet`, `magenta`, `slate`, `steel`, `stone`) e una faccia, sempre da un insieme fissato. Il bot sta su un quadrato dagli angoli arrotondati. Faccia ed emoji restano ferme, e si animano quando la chat è selezionata o quando il bot lavora.

La cronologia di una chat è `chat_events`: righe in sola aggiunta, ordinate da un progressivo. Ogni riga ha un attore (una persona oppure un bot), un `kind` e un `jsonb`. I kind non sono un elenco chiuso. Il kind `message` porta il testo in `payload.body`. Cancellare una chat toglie i suoi eventi. I bot che dopo quella cancellazione non restano in nessun’altra chat e non compaiono in eventi di un’altra chat spariscono.

Gli alert e i task programmati vivono direttamente nel server/container del worker: l’agente può impostare, consultare e cancellare sveglie sul server, che allo scadere risvegliano il bot nella chat con i permessi di chi possiede il bot.

Gmail e WhatsApp non sono in questa fase. Quando torna WhatsApp, è il canale ufficiale di Meta: 2tapdoc è l’unico intermediario, i webhook archiviano i messaggi, e in fase di collegamento di un numero già su WhatsApp Business si prevede la sincronizzazione della cronologia che lo studio autorizza. Gmail si reinserisce dopo, per la sua via.

## Ordine di costruzione

1. Il modello dei dati e i confini di accesso, perché tutto il resto poggia lì.
2. Le funzioni che garantiscono l’esecuzione, poche e affidabili, prima di allargare la superficie.
3. L’AI come interfaccia: capisce la richiesta, legge nel perimetro dell’utente, invoca le funzioni certe, e dice cosa è successo.
4. La UI, solo dove l’interazione in linguaggio naturale ha bisogno di essere vista, confermata o corretta.
