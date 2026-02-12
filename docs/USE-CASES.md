# Use Cases

## UC-01: Inbox Triage (verfügbar)

**Szenario:** Ein Manager möchte morgens schnell einen Überblick über wichtige E-Mails.

**Prompt:**
> Fasse meine ungelesenen E-Mails der letzten 24 Stunden zusammen. Kategorisiere nach: dringend, informativ, delegierbar.

**Tools die Claude nutzt:**
1. `list_emails` -- Filter: `isRead eq false`, sortiert nach Datum
2. `read_email` -- Für jede relevante Mail den vollständigen Inhalt lesen
3. Claude erstellt eine strukturierte Zusammenfassung

**Beispiel-Output:**

```
## Inbox Triage -- 11.02.2026

### Dringend (2)
1. **Projektfreigabe PHOENIX** -- Von: Dr. Schmidt <schmidt@heidenhain.de>
   Freigabe bis heute 17:00 Uhr erforderlich. Budget-Übersicht angehängt.
   -> Aktion: Freigabe erteilen oder Rückfragen klären

2. **Server-Ausfall Produktion** -- Von: IT-Monitoring <monitoring@intern>
   DB-Server prod-sql-03 seit 08:15 nicht erreichbar. Eskalation an Infrastruktur.
   -> Aktion: Status prüfen, ggf. mit IT-Leitung abstimmen

### Informativ (3)
1. **Monatsbericht Januar** -- Von: Controlling <controlling@intern>
   Umsatz +12% ggü. Vorjahr. Details im Anhang.

2. **Neue Datenschutzrichtlinie** -- Von: Compliance <compliance@intern>
   Ab 01.03. gelten aktualisierte Richtlinien. Keine sofortige Aktion nötig.

3. **Team-Event Planung** -- Von: HR <hr@intern>
   Umfrage zum Sommer-Event. Deadline: Freitag.

### Delegierbar (1)
1. **Angebot Büromaterial** -- Von: Office Manager <office@intern>
   Neues Angebot von Staples eingetroffen. Vergleich mit bestehendem Vertrag nötig.
   -> Delegieren an: Assistenz / Office Management
```

**Geschätzter Zeitgewinn:** 15-30 Minuten pro Tag

---

## UC-02: Gezielte E-Mail-Suche (verfügbar)

**Szenario:** Ein Berater sucht alle E-Mails zu einem bestimmten Projekt.

**Prompt:**
> Suche alle E-Mails zum Thema "PHOENIX Angebot" der letzten 2 Wochen und fasse die Kernpunkte zusammen.

**Tools:**
1. `search_emails` -- KQL: `subject:PHOENIX AND body:Angebot`
2. `read_email` -- Für die Top-Ergebnisse
3. Claude erstellt eine chronologische Zusammenfassung

**Variationen:**
- `"Finde alle E-Mails von mueller@heidenhain.de zum Thema Angebot"` -- KQL: `from:mueller@heidenhain.de subject:Angebot`
- `"Suche nach E-Mails mit PDF-Anhängen zum Projekt PHOENIX"` -- KQL: `PHOENIX hasattachment:true`
- `"Zeige mir alle E-Mails an den Verteiler team@intern der letzten Woche"` -- KQL: `to:team@intern` mit Datumsfilter

---

## UC-03: Ordner-Übersicht (verfügbar)

**Szenario:** Neuer Mitarbeiter möchte die Mailbox-Struktur verstehen oder ein Manager will den Überblick über ungelesene Mails in verschiedenen Ordnern.

**Prompt:**
> Zeige mir alle meine Mail-Ordner mit der Anzahl ungelesener Mails.

**Tools:**
1. `list_mail_folders` -- Mit `include_children=true`

**Beispiel-Output:**

```
| Ordner           | Gesamt | Ungelesen |
|------------------|--------|-----------|
| Posteingang      |  1.247 |        12 |
| Gesendete Elemente|    834 |         0 |
| Entwürfe         |      3 |         0 |
| Gelöschte Elemente|    156 |         0 |
| Junk-E-Mail      |     28 |        28 |
| Archiv           |  5.412 |         0 |
|   -> Projekte    |  2.103 |         0 |
|   -> Kunden      |  1.847 |         0 |
```

---

## UC-04: E-Mail-Zusammenfassung (verfügbar)

**Szenario:** Ein Consultant kommt aus einem langen Meeting und möchte schnell wissen, was eine bestimmte Mail enthält.

**Prompt:**
> Lies die neueste E-Mail von der IT-Abteilung und fasse sie zusammen.

**Tools:**
1. `list_emails` -- Filter nach Absender, sortiert nach Datum, Top 1
2. `read_email` -- Vollständigen Inhalt lesen
3. Claude erstellt eine prägnante Zusammenfassung

---

## Geplante Use Cases

### UC-05: Schnelle Antwort (Phase 2.2)

> "Antworte auf die letzte Mail von Frau Schmidt: Danke, besprechen wir im nächsten Jour Fixe."

Claude nutzt `read_email` um die letzte Mail zu finden und `reply_email` um die Antwort zu senden.

### UC-06: Meeting-Vorbereitung (Phase 3 + 4)

> "Was steht morgen im Kalender? Lade die relevanten Dokumente aus OneDrive."

Claude nutzt Kalender-Tools um Termine abzurufen und OneDrive-Tools um verknüpfte Dokumente zu finden.

### UC-07: Terminkoordination (Phase 3)

> "Finde den nächsten freien 60-Min-Slot mit max.mustermann@example.com."

Claude nutzt Free/Busy-Abfragen der Kalender-API um verfügbare Zeitfenster zu ermitteln.

### UC-08: Dokument-Suche (Phase 4)

> "Finde den letzten Monatsbericht in OneDrive/PHOENIX/Reports."

Claude nutzt OneDrive-Suche und -Browse-Tools um Dateien zu finden und herunterzuladen.
