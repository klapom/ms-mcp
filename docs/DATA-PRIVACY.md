# Datenschutz & DSGVO

Siehe Project_Description.md Abschnitt 5 für die vollständige Dokumentation.

## Kurzfassung

- Der MCP-Server ist ein **zustandsloser Proxy** – keine persistente Datenspeicherung
- Tool-Responses (E-Mail-Inhalte etc.) werden an Anthropic übertragen (als Teil des LLM-Prompts)
- Auth-Tokens werden im OS Keychain gespeichert (verschlüsselt)
- Logging enthält **keine PII** – nur Metadaten (Tool-Name, Status, Latenz)
- Context-Budget-Management minimiert die übertragene Datenmenge

## Checkliste für Deployment

Siehe Project_Description.md Abschnitt 5.4.
