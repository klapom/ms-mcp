# Datenschutz & DSGVO

## Übersicht

Der pommer-m365-mcp Server ist ein **zustandsloser Proxy** zwischen Claude (Anthropic) und Microsoft Graph API. Er speichert keine Daten persistent.

## Datenfluss

```
Benutzer --> Claude Desktop --> MCP-Server (lokal) --> Microsoft Graph API --> Microsoft 365
                  |
           Anthropic API (LLM-Verarbeitung)
```

**Wichtig:** E-Mail-Inhalte, die über `read_email` abgerufen werden, werden als Teil des LLM-Kontexts an die Anthropic API übertragen. Dies ist systembedingt und entspricht dem Nutzungsmodell von Claude Desktop. Der MCP-Server selbst hat keinen Einfluss auf die Datenverarbeitung durch Anthropic.

## Was wird NICHT geloggt

| Datum | Beispiel | Geloggt? |
|---|---|---|
| E-Mail-Body / Betreffzeile | "Angebot PHOENIX..." | **NEIN** |
| Empfänger / Absender | "max@example.com" | **NEIN** |
| Datei-Inhalte | PDF, DOCX Inhalte | **NEIN** |
| Auth-Token | "eyJ0eXAiOi..." | **NEIN** |
| Authorization-Header | "Bearer ey..." | **NEIN** |
| Suchanfragen (KQL) | "from:mueller subject:Angebot" | **NEIN** |
| User-IDs / E-Mail-Adressen | "user@tenant.com" | **NEIN** |

## Was wird geloggt (nur Metadaten)

| Datum | Beispiel | Zweck |
|---|---|---|
| Tool-Name | "list_emails" | Performance-Monitoring |
| HTTP-Status | 200, 404, 429 | Fehleranalyse |
| Latenz | 245ms | Performance |
| Request-ID | "a1b2c3d4-..." | Korrelation |
| Fehler-Code | "ErrorItemNotFound" | Debugging |
| Log-Level | "info", "error" | Filterung |

Logs werden auf `stderr` geschrieben (da `stdout` für MCP JSON-RPC reserviert ist) und sind standardmäßig nicht persistent. Die Persistierung von Logs liegt in der Verantwortung des Betreibers.

## Token-Sicherheit

- Auth-Token werden **im Arbeitsspeicher** gehalten (nicht auf Disk)
- Token werden bei jedem Request über MSAL silent flow erneuert
- Persistenter Token-Cache (OS Keychain) ist für eine spätere Phase geplant
- Token-Werte werden in Logs **redaktiert** (`[REDACTED]`)
- Client Secrets (falls konfiguriert) werden ebenfalls nicht geloggt

## Context-Budget-Management

Um die Menge der an Anthropic übertragenen Daten zu minimieren:

- **`$select`:** Nur benötigte Felder werden von der Graph API abgerufen
- **`maxItems`:** Standardmäßig max. 25 Ergebnisse pro Abfrage (konfigurierbar via `MAX_ITEMS`)
- **`maxBodyLength`:** E-Mail-Bodys werden auf 500 Zeichen gekürzt (konfigurierbar via `MAX_BODY_LENGTH`)
- **Body-Truncation** mit `[truncated]` Markierung, damit der Benutzer erkennt, dass der Text gekürzt wurde
- **HTML-zu-Text-Konvertierung:** HTML-Tags werden entfernt, nur Klartext wird übertragen

## Tool-Datenmatrix

| Tool | Liest | Schreibt | Sensible Daten im Response |
|---|---|---|---|
| `list_emails` | E-Mail-Metadaten (Betreff, Absender, Datum, Vorschau) | Nein | Betreffzeilen, Absender, Body-Vorschau |
| `read_email` | E-Mail-Volltext + Metadaten | Nein | E-Mail-Inhalt, Empfänger, Betreff |
| `list_mail_folders` | Ordner-Namen und Counts | Nein | Ordner-Namen |
| `search_emails` | E-Mail-Metadaten (wie list_emails) | Nein | Betreffzeilen, Absender, Body-Vorschau |

## Netzwerkkommunikation

Der MCP-Server kommuniziert ausschließlich mit folgenden Endpunkten:

| Endpunkt | Zweck | Protokoll |
|---|---|---|
| `graph.microsoft.com` | Microsoft Graph API | HTTPS (TLS 1.2+) |
| `login.microsoftonline.com` | Azure AD Authentifizierung | HTTPS (TLS 1.2+) |
| `microsoft.com/devicelogin` | Device Code Flow (nur Browser) | HTTPS (TLS 1.2+) |

Es werden **keine Daten an andere Endpunkte** gesendet. Der Server hat keine eigene Netzwerk-Schnittstelle (kein HTTP-Server) -- er kommuniziert mit Claude Desktop ausschließlich über `stdio`.

## Empfehlungen für Unternehmen

1. **Sensible Daten:** Besprechen Sie mit Ihrem DPO (Datenschutzbeauftragten), ob E-Mail-Inhalte an die Anthropic API übertragen werden dürfen. Prüfen Sie die [Anthropic-Nutzungsbedingungen](https://www.anthropic.com/policies/terms-of-service) bezüglich Datenverarbeitung.
2. **Readonly-Preset:** Verwenden Sie `TOOL_PRESET=readonly` um schreibende Operationen zu deaktivieren.
3. **Minimal Scopes:** Konfigurieren Sie nur die tatsächlich benötigten API-Berechtigungen in der Azure App Registration.
4. **Audit:** Alle Graph API Zugriffe werden in den Azure AD Audit Logs erfasst. Nutzen Sie diese für Compliance-Nachweise.
5. **Netzwerk-Segmentierung:** Der Server benötigt nur Zugang zu `graph.microsoft.com` und `login.microsoftonline.com`. Alle anderen Endpunkte können auf Firewall-Ebene blockiert werden.
6. **Context-Budget:** Konfigurieren Sie `MAX_BODY_LENGTH` und `MAX_ITEMS` so niedrig wie für den Use Case vertretbar, um die an Anthropic übertragene Datenmenge zu minimieren.
7. **Log-Management:** Falls Logs persistiert werden, stellen Sie sicher, dass keine PII in den Logs enthalten sind (Standard-Konfiguration gewährleistet dies).

## Rechtliche Einordnung

- Der MCP-Server selbst verarbeitet Daten nur **im Transit** (zustandsloser Proxy)
- Die **Auftragsverarbeitung** findet bei Anthropic statt (LLM-Verarbeitung der E-Mail-Inhalte)
- Microsoft 365 Daten unterliegen dem bestehenden **Microsoft-Vertrag** (DPA/AVV)
- Für den Einsatz in Unternehmen empfehlen wir eine **DSFA** (Datenschutz-Folgenabschätzung) gemäß Art. 35 DSGVO

## Checkliste für Deployment

- [ ] DPO über Anthropic-Datenübertragung informiert
- [ ] Azure App Registration mit minimalen Berechtigungen konfiguriert
- [ ] Admin-Consent nur für benötigte Scopes erteilt
- [ ] `TOOL_PRESET` entsprechend dem Use Case gesetzt
- [ ] `MAX_BODY_LENGTH` und `MAX_ITEMS` konfiguriert
- [ ] Firewall-Regeln für `graph.microsoft.com` und `login.microsoftonline.com` geprüft
- [ ] Azure AD Audit Logs aktiviert
- [ ] Mitarbeiter über Datenfluss informiert (Transparenzpflicht)
