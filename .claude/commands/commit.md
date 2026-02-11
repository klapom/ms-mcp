---
description: Quality Gates → Docs aktualisieren → Commit → Push
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

### 3. Commit

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

### 4. Push

Führe aus:
```bash
git push -u origin HEAD
```

Falls der Remote nicht konfiguriert ist, melde das und überspringe den Push.

### Zusammenfassung

Am Ende: Zeige eine Zusammenfassung mit:
- Welche Quality Gates bestanden wurden
- Welche Docs aktualisiert wurden
- Die Commit-Message
- Den Push-Status

### 5. Code Review (3 Perspektiven)

Nach der Push-Zusammenfassung: Analysiere die committen Änderungen (`git diff HEAD~1`) aus drei Perspektiven und gib die Ergebnisse aus.

#### Senior Software Developer

Prüfe die Änderungen auf:
- Code-Qualität: Naming, Lesbarkeit, DRY-Prinzip
- Fehlerbehandlung: Werden Fehler korrekt gefangen und propagiert?
- Type Safety: Gibt es `any`, unsafe casts, fehlende Typen?
- Security: Injection-Risiken, PII-Leaks, unsichere Defaults?
- Dependencies: Werden neue Deps sinnvoll eingesetzt?

Gib Findings als Liste aus mit Severity (CRITICAL / IMPORTANT / NICE-TO-HAVE) und betroffener Datei:Zeile.

#### Senior Tester

Prüfe die Änderungen auf:
- Test-Abdeckung: Wurden neue Funktionen/Pfade getestet?
- Fehlende Tests: Edge Cases, Fehlerszenarien, Boundary Values
- Test-Qualität: Sind bestehende Tests aussagekräftig? Testen sie Verhalten oder Implementation?
- Mocking: Werden Mocks korrekt eingesetzt? Fehlen MSW-Handler?
- Coverage: Gibt es Hinweise auf Coverage-Lücken?

Gib Findings als Liste aus mit Severity und konkreten Vorschlägen für fehlende Tests.

#### Senior Architect

Prüfe die Änderungen auf:
- Architektur-Konformität: Passen die Änderungen zur bestehenden Schichtung (schemas → tools → middleware → utils)?
- Patterns: Werden etablierte Patterns korrekt eingesetzt (Zod SSOT, Cross-Cutting Concerns)?
- Coupling: Entstehen unerwünschte Abhängigkeiten oder zirkuläre Imports?
- Skalierbarkeit: Skaliert der Ansatz wenn weitere Tools/Module hinzukommen?
- API-Design: Sind Schnittstellen konsistent und erweiterbar?

Gib Findings als Liste aus mit Severity und Architektur-Empfehlungen.

#### Format

Gib die Reviews in diesem Format aus:

```
## Code Review

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
Der User entscheidet selbst, welche Findings er umsetzen möchte.
