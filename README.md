# SmartDoc AI – Prototype

## Beschrijving
SmartDoc AI is een prototype voor het automatiseren van vastgoeddocumenten
(EPC, Asbest, Elektrische keuring) met AI.

Het systeem laat toe om PDF-documenten te uploaden, automatisch te registreren
en een eerste risico-analyse (“Red Flags”) uit te voeren.

## Doel van het prototype
- Aantonen van architectuur en workflow
- Testen van AI-ondersteunde documentanalyse
- Geen afgewerkt product, maar een functioneel MVP

## Functionaliteiten
- Upload van PDF-documenten
- Opslag in Supabase Storage
- Documentregistratie in database
- Analyse pipeline (queued → done)
- Status: Green / Orange / Red (prototype)

## Technologie
- Next.js 14 (App Router)
- TypeScript
- Supabase (Database + Storage)
- Zod (validatie)
- Prototype AI-analyse (regels / mock)

## Hoe testen (lokaal)
1. Open de property-pagina (demo property)
2. Upload een PDF-document
3. Bekijk de documentstatus
4. Start analyse en bekijk resultaat

(In het prototype imiteren we de werker met een knop (“Run Analysis”) voor we echte cron/edge jobs doen.) 

(voorlopig simpele Red Flag rules (nog geen geimplementeerd) met LLM backup als confidence laag is of summary empty.) 

Database = (https://supabase.com/dashboard/project/aqtwnyesdztiyitedykt ) 

Hoe prototype testen : 

http://localhost:3000/ 			(home page) 

http://localhost:3000/properties/[een valid uuid]     hier upload knoppen voor dat pand 

geen valid id ingevuld? het programma gebruikt het demo id en voegt het geuploade document hieraan toe (enkel voor prototype) 

“4b97af99-251a-4410-9a06-6edf0d03a2d1" (demo id) 

Demo pand bekijken (reeds dummy file geupload naar supabase voor ASBESTOS): 

http://localhost:3000/properties/4b97af99-251a-4410-9a06-6edf0d03a2d1  

Hier zie je de knop “run alalysis” en die controleert het bestand en toont resultaat 
(voorlopig niet veel echte controle) 