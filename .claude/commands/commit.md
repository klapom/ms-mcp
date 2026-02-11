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
