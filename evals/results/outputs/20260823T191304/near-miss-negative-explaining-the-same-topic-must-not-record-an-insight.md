# pgvector: розмірності колонок та невідповідність розмірів

## Як працюють розмірності

Коли ви створюєте колонку типу **vector** в pgvector, ви вказуєте **фіксовану кількість розмірностей**:

```sql
CREATE TABLE embeddings (
    id SERIAL PRIMARY KEY,
    content TEXT,
    embedding vector(768)  -- ← точно 768 розмірностей
);
```

Цей вектор **повинен мати рівно 768 компонентів** — не більше, не менше.

## Чому невідповідність розмірів повертає нуль рядків

Коли ви запитуєте з вектором іншої розмірності:

```sql
-- ❌ embedding має 768 розмірностей
-- ❌ query_vector має 384 розмірності

SELECT * FROM embeddings 
WHERE embedding <-> '[0.1, 0.2, ..., 0.3]'::vector(384) < 0.5;
-- → 0 рядків (або помилка, залежно від версії)
```

**Причини:**

| Аспект | Деталь |
|--------|---------|
| **Математика** | Вектори 768D і 384D існують в різних просторах — обчислити дистанцію неможливо |
| **Безпека типів** | pgvector забезпечує сувору типізацію: `vector(768) ≠ vector(384)` |
| **Поведінка** | Замість помилки pgvector повертає порожній результат (тиха невдача) |

## Приклад з помилкою

```sql
-- ✅ Правильно: розмірності збігаються
SELECT * FROM embeddings 
WHERE embedding <-> '[0.1, 0.2, ..., 0.3]'::vector(768) < 0.5;
-- → знайдені рядки

-- ❌ Невідповідність розмірів
INSERT INTO embeddings (content, embedding) 
VALUES ('text', '[0.1, 0.2, 0.3]'::vector(3));
-- ERROR: vector dimension mismatch
-- Expected 768, got 3
```

## Як перевірити розмірність

```sql
-- Дізнатися розмірність колонки
SELECT column_name, udt_name 
FROM information_schema.columns 
WHERE table_name = 'embeddings';

-- vector(768) | vector

-- Перевірити розмірність вектора
SELECT dimension(embedding) 
FROM embeddings 
LIMIT 1;
-- → 768
```

## Best practices

```sql
-- 🟢 Завжди использовуйте правильну розмірність в запитах
PREPARE search_embedding AS
  SELECT * FROM embeddings 
  ORDER BY embedding <-> $1::vector(768) 
  LIMIT 10;

-- 🟢 Перевіряйте розмірність перед запитом
DO $$
DECLARE
  query_vec vector(768) := ...;
BEGIN
  IF dimension(query_vec) != 768 THEN
    RAISE EXCEPTION 'Vector dimension mismatch: expected 768, got %', dimension(query_vec);
  END IF;
END $$;
```

**Резюме:** pgvector вимагає точної відповідності розмірностей, бо це математична необхідність для операцій подібності. Невідповідність повертає нуль результатів як спосіб "безпечної невдачі" замість некоректних обчислень.