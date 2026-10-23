"""
final_cleanup.py
----------------
Removes ALL questions (and their options/i18n) that were inserted by the
first crashed seed run. Those rows have IDs lower than the good batch.

Strategy: keep only the 6 most recently inserted questions per topic
(the ones the fixed seed_data.py inserted). Delete any extras.

Also replaces the rupee sign and other non-ASCII in the profit question
with ASCII equivalents directly in the database so future runs match.
"""
import sqlite3

conn = sqlite3.connect('vision.db')
conn.execute("PRAGMA foreign_keys = OFF")  # we handle cascades manually
c = conn.cursor()

# ── Step 1: For each topic, keep only the 6 highest-ID questions ──────────
topics = c.execute("SELECT id, name FROM topics").fetchall()
deleted_total = 0

for topic_id, topic_name in topics:
    ids = [r[0] for r in c.execute(
        "SELECT id FROM questions WHERE topic_id=? ORDER BY id DESC",
        (topic_id,)
    ).fetchall()]

    if len(ids) <= 6:
        continue  # nothing to remove

    keep = set(ids[:6])      # 6 most recent (correct) ones
    remove = [i for i in ids if i not in keep]

    for qid in remove:
        c.execute("DELETE FROM question_options WHERE question_id=?", (qid,))
        c.execute("DELETE FROM question_i18n    WHERE question_id=?", (qid,))
        c.execute("DELETE FROM questions         WHERE id=?",          (qid,))
        deleted_total += 1

# ── Step 2: Replace non-ASCII characters in remaining question texts ───────
non_ascii_replacements = [
    ('\u20b9', 'Rs.'),    # ₹ rupee sign
    ('\u2212', '-'),      # − minus sign
    ('\u00b2', '^2'),     # ² superscript 2
    ('\u221a', 'sqrt'),   # √
    ('\u2264', '<='),     # ≤
    ('\u2265', '>='),     # ≥
    ('\u00b0', ' degrees'), # °
    ('\u03c0', 'pi'),     # π
    ('\u221d', 'proportional to'),
    ('\u2081', '1'),
    ('\u2082', '2'),
]

rows = c.execute("SELECT id, question_text FROM questions").fetchall()
updated = 0
for qid, text in rows:
    new_text = text
    for old, new in non_ascii_replacements:
        new_text = new_text.replace(old, new)
    if new_text != text:
        c.execute("UPDATE questions SET question_text=? WHERE id=?", (new_text, qid))
        c.execute("UPDATE question_i18n SET question_text=? WHERE question_id=?",
                  (new_text, qid))
        updated += 1

conn.commit()

# ── Step 3: Verify ────────────────────────────────────────────────────────
print(f"Questions deleted (extras) : {deleted_total}")
print(f"Questions updated (non-ASCII text fixed) : {updated}")
print()

for table in ['subjects','topics','questions','question_options','question_i18n']:
    n = c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"  {table:<22} {n:>4} rows")

print()
rows = c.execute('''
    SELECT s.name, t.name, COUNT(q.id)
    FROM subjects s
    JOIN topics t ON t.subject_id = s.id
    LEFT JOIN questions q ON q.topic_id = t.id
    GROUP BY s.name, t.name
    ORDER BY s.name, t.name
''').fetchall()
for r in rows:
    print(f"  {r[0]:<20} | {r[1]:<25} | {r[2]} questions")

conn.close()
print("\nCleanup complete.")
