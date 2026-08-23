## 📋 Підсумок документації про review pipeline

Прочитав всі необхідні документи. Ось що я дізнався про **review pipeline** в цьому репозиторії:

### **Структура pipeline** (`reviewer-core`)
Review pipeline складається з таких етапів (відповідно до мерейд-діаграми в README):

1. **`assemblePrompt()`** (`prompt.ts`) — збирає prompt з:
   - diff
   - system prompt
   - repo map (від repo-intel)
   - опціональні слоти (skills, memory, specs, callers) — для майбутніх уроків

2. **`wrapUntrusted()`** + **INJECTION_GUARD** (`prompt.ts`) — захист від prompt-injection, изолює untrusted content

3. **`LLMProvider` (injected)** (`llm/openrouter.ts`) — абстрактний провайдер LLM (OpenAI/Anthropic), що дозволяє мокувати в тестах

4. **Structured Output** (`llm/structured.ts`) — парс LLM-відповіді через Zod → JSON Schema з repair-логікою

5. **`groundFindings()`** (`grounding.ts`) — **обов'язковий gate**: перевіряє кожне знахідження проти реальних ліній у diff. Hallucinated references падають.

6. **Review** — фінальний вихід з `verdict`, `score` (перераховується детерміністично, не з моделі), і grounded findings

### **Важні файли для змін**
- `reviewer-core/src/review/run.ts` — оркестрація run (single-pass за замовчуванням)
- `reviewer-core/src/index.ts` — публічний API
- `reviewer-core/README.md` — головна документація

### **Тестування** 
- Hermetic, без реальних LLM-calls (мокуються через `src/adapters/mocks.ts`)
- Покриває: assemblePrompt, grounding gate, toReview, full run
- `npm test` в reviewer-core папці

---

**Готовий!** Тепер я знаю точну структуру. Какі конкретно зміни ви плануєте зробити в review pipeline?