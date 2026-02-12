---
description: Quality Gates → Review → Fix → Review → User entscheidet Commit
---
Führe den vollständigen Commit-Workflow durch für: $ARGUMENTS

## Workflow

### 1. Quality Gates (Abbruch bei Fehler)

Führe nacheinander aus:

```bash
pnpm run lint:fix
pnpm run typecheck
pnpm run test
```

Wenn einer der Schritte fehlschlägt: Versuche den Fehler zu fixen.
Wenn der Fix nicht trivial ist, brich ab und erkläre was schiefgelaufen ist.

### 2. Docs Auto-Update

Führe aus:

```bash
pnpm run docs:generate
```

Dieses Script scannt `src/tools/` und `src/schemas/` und aktualisiert:
- `docs/TOOLS.md` — Tool-Referenz (Name, Beschreibung, Schema, Klassifizierung)
- `docs/PERMISSIONS.md` — Permission-Matrix (Scope pro Tool)

Falls sich Docs geändert haben, stage sie mit `git add docs/`.

### 3. Code Review — Runde 1 (VOR dem Commit)

Analysiere ALLE uncommitteten Änderungen (`git diff` + `git diff --staged` + untracked files) aus drei Perspektiven.

#### Senior Software Developer

Prüfe die Änderungen auf:
- Code-Qualität: Naming, Lesbarkeit, DRY-Prinzip
- Fehlerbehandlung: Werden Fehler korrekt gefangen und propagiert?
- Type Safety: Gibt es `any`, unsafe casts, fehlende Typen?
- Security: Injection-Risiken, PII-Leaks, unsichere Defaults?
- Dependencies: Werden neue Deps sinnvoll eingesetzt?

#### Senior Tester

Prüfe die Änderungen auf:
- Test-Abdeckung: Wurden neue Funktionen/Pfade getestet?
- Fehlende Tests: Edge Cases, Fehlerszenarien, Boundary Values
- Test-Qualität: Sind bestehende Tests aussagekräftig? Testen sie Verhalten oder Implementation?
- Mocking: Werden Mocks korrekt eingesetzt? Fehlen MSW-Handler?
- Coverage: Gibt es Hinweise auf Coverage-Lücken?

#### Senior Architect

Prüfe die Änderungen auf:
- Architektur-Konformität: Passen die Änderungen zur bestehenden Schichtung (schemas → tools → middleware → utils)?
- Patterns: Werden etablierte Patterns korrekt eingesetzt (Zod SSOT, Cross-Cutting Concerns)?
- Coupling: Entstehen unerwünschte Abhängigkeiten oder zirkuläre Imports?
- Skalierbarkeit: Skaliert der Ansatz wenn weitere Tools/Module hinzukommen?
- API-Design: Sind Schnittstellen konsistent und erweiterbar?

#### Format Runde 1

```
## Code Review — Runde 1

### Senior Developer
- [CRITICAL] datei.ts:42 — Beschreibung des Problems
- [IMPORTANT] datei.ts:10 — Beschreibung
- [NICE-TO-HAVE] datei.ts:5 — Beschreibung

### Senior Tester
- [CRITICAL] Fehlender Test für ...
- [IMPORTANT] Edge Case nicht abgedeckt: ...

### Senior Architect
- [IMPORTANT] Coupling zwischen X und Y ...
- [NICE-TO-HAVE] Pattern Z wäre hier besser ...
```

Falls keine Findings in einer Kategorie: "Keine Findings." ausgeben.

### 4. Automatische Fixes (CRITICAL + IMPORTANT)

Setze ALLE Findings mit Severity **CRITICAL** und **IMPORTANT** aus Runde 1 direkt um:
- Code-Änderungen durchführen
- Fehlende Tests ergänzen
- Architektur-Probleme beheben

Nach den Fixes: Quality Gates erneut laufen lassen (`lint:fix`, `typecheck`, `test`), um sicherzustellen dass nichts kaputt gegangen ist.

NICE-TO-HAVE Findings werden NICHT automatisch gefixt — sie werden dem User nur zur Kenntnis gegeben.

### 5. Code Review — Runde 2 (nach den Fixes)

Analysiere erneut ALLE uncommitteten Änderungen (inklusive der Fixes aus Schritt 4) aus den gleichen drei Perspektiven.

#### Format Runde 2

```
## Code Review — Runde 2 (nach Fixes)

### Behobene Findings aus Runde 1
- ✅ [CRITICAL] datei.ts:42 — Was wurde gefixt
- ✅ [IMPORTANT] datei.ts:10 — Was wurde gefixt

### Verbleibende Findings
- [NICE-TO-HAVE] datei.ts:5 — Beschreibung (nicht automatisch gefixt)

### Neue Findings (falls durch Fixes entstanden)
- [IMPORTANT] datei.ts:20 — Beschreibung
```

Falls keine Findings mehr: "Keine offenen Findings. Code ist bereit für Commit." ausgeben.

### 6. User-Entscheidung

Frage den User ob der Commit durchgeführt werden soll. Zeige dabei:
- Zusammenfassung der Quality Gates
- Zusammenfassung der Docs-Updates
- Übersicht: was wurde gefixt, was ist offen (NICE-TO-HAVE)
- Vorgeschlagene Commit-Message (Conventional Commit, Englisch)

Der User entscheidet:
- **Commit + Push**: Commit erstellen und pushen
- **Nur Commit**: Commit ohne Push
- **Abbruch**: Kein Commit, User will manuell nacharbeiten

### 7. Commit + Push (nur wenn User zustimmt)

1. Prüfe `git status` und `git diff --staged` um alle Änderungen zu verstehen
2. Stage alle relevanten geänderten Dateien (NICHT .env oder credentials)
3. Erstelle eine Conventional Commit Message basierend auf den Änderungen:
   - `feat:` für neue Features/Tools
   - `fix:` für Bug-Fixes
   - `docs:` für reine Doku-Änderungen
   - `test:` für Test-Änderungen
   - `chore:` für Config/Infrastruktur
   - `refactor:` für Refactorings
   - Falls $ARGUMENTS angegeben: Nutze das als Basis für die Message
   - Sprache: Englisch
4. Erstelle den Commit
5. Falls Push gewünscht:
   ```bash
   git push -u origin HEAD
   ```
   Falls der Remote nicht konfiguriert ist, melde das und überspringe den Push.
