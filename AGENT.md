# Portal-Agent

Der Portal-Agent ist als zustandsbehafteter Tool-Agent aufgebaut. Er nutzt nicht nur die aktuelle Nutzernachricht, sondern auch:

- den dauerhaft gespeicherten Chatverlauf,
- den Conversation-State mit bekannten Fakten und laufendem Ziel,
- semantische Memory-Treffer aus der Vektordatenbank,
- die echten Portal-Tools mit Rechteprüfung.

## Persistenter Kontext

Der Chatverlauf liegt in `AgentConversation` und `AgentMessage`.

Der laufende Arbeitszustand liegt in `AgentConversationState`:

- `goal`: aktuelles Ziel, z. B. `create_contract`
- `status`: `idle`, `collecting`, `waiting_for_user`, `done`
- `facts`: bekannte Fakten wie Mieter, Immobilie, Einheit, Vorlage, E-Mail, Mietdauer
- `pendingQuestion`: offene fachliche Rückfrage
- `lastEntityRefs`: zuletzt gefundene Objekte

Dieser Zustand bleibt erhalten, bis der Nutzer im Agent-Widget auf `Reset` klickt oder die Conversation explizit gelöscht wird.

## Transparente Backend-Logs

Jede Anfrage erzeugt einen Datensatz in `AgentRunLog`.

Pro Run werden gespeichert:

- ursprüngliche Nutzereingabe
- erzeugter System-Prompt
- kompletter Modellkontext
- Modellantworten für Planung und finale Antwort
- Tool-Calls mit Parametern
- Tool-Ergebnisse
- finale Antwort
- Fehler, falls vorhanden

Im Agent-Widget gibt es den Button `Kontext`. Er lädt über:

```http
GET /api/agent/chat?conversationId=<id>&includeDebug=1
```

den gespeicherten Conversation-State und die letzten Run-Logs.

## Agent-Ablauf

1. Nutzernachricht wird gespeichert.
2. Der bestehende Conversation-State wird geladen.
3. Fakten aus der Nutzernachricht werden ergänzt.
4. Das LLM plant den nächsten Schritt als JSON.
5. Der Server validiert Tool-Namen und Parameter.
6. Der Server führt Tools mit Portal-Rechteprüfung aus.
7. Tool-Ergebnisse aktualisieren den Conversation-State.
8. Das LLM formuliert die finale Antwort aus echten Tool-Ergebnissen.
9. Ergebnis und Debug-Daten werden gespeichert.

## Kontextbezogene Bestätigungen

Antworten wie `Ja`, `Genau`, `Korrekt`, `Mach das` oder `Weiter` werden nicht isoliert interpretiert. Der Agent verwendet dafür:

- `goal`
- `pendingQuestion`
- bekannte `facts`
- zuletzt gefundene Entitäten

Beispiel: Wenn das Ziel `create_contract` ist, führt `Genau` die Vertragserstellung mit den bekannten Daten fort.

## Wichtige Dateien

- `src/lib/agent.ts`: Agent-Pipeline, LLM-Planung, finale Antwort
- `src/lib/agent-tools.ts`: Tool-Registry und Tool-Ausführung
- `src/lib/agent-state.ts`: Conversation-State, Faktenerkennung, Bestätigungen
- `src/lib/agent-debug.ts`: AgentRunLog-Erstellung und Sanitizing
- `src/app/api/agent/chat/route.ts`: Web-Chat API, Streaming und Debug-GET
- `src/components/AgentChatWidget.tsx`: Agent-Widget mit Kontext- und Reset-Button

## Testbeispiele

```text
Wer wohnt aktuell in meinen Objekten?
```

Erwartung: Agent nutzt `search_tenants` und listet aktuelle Mieter.

```text
Erstelle einen Mietvertrag für den Mieter in der Beispielweg 7
```

Erwartung: Agent sucht Mieter zur Immobilie, prüft Vorlage, erstellt Vertrag oder fragt nur bei echter Mehrdeutigkeit nach.

```text
Genau
```

Erwartung: Agent führt den laufenden Prozess mit dem gespeicherten Kontext fort.
