"""
cleanup_duplicates.py
Removes the 3 extra Algebra questions inserted by the first (crashed) seed run.
Those questions contain Unicode characters (smart minus U+2212) in their text,
while the correctly-inserted versions use plain ASCII hyphens.
Safe to run once — does nothing if already clean.
"""
import sqlite3

conn = sqlite3.connect('vision.db')
c = conn.cursor()

# Find Algebra topic id
row = c.execute("SELECT id FROM topics WHERE name='Algebra'").fetchone()
if not row:
    print("Algebra topic not found — nothing to do.")
    conn.close()
    exit()

topic_id = row[0]

# Get all Algebra question ids ordered by id
all_ids = [r[0] for r in c.execute(
    "SELECT id FROM questions WHERE topic_id=? ORDER BY id", (topic_id,)
).fetchall()]

print(f"Algebra question ids: {all_ids}  (total={len(all_ids)})")

if len(all_ids) <= 6:
    print("Already 6 or fewer questions -- no cleanup needed.")
    conn.close()
    exit()

# The first 3 ids are from the crashed run (Unicode text).
# The last 6 ids are the correctly seeded ones (ASCII text).
# We delete the first 3.
ids_to_delete = all_ids[:3]
print(f"Deleting question ids: {ids_to_delete}")

for qid in ids_to_delete:
    # Cascade: delete options and i18n first (no ON DELETE CASCADE in SQLite by default)
    c.execute("DELETE FROM question_options WHERE question_id=?", (qid,))
    c.execute("DELETE FROM question_i18n WHERE question_id=?", (qid,))
    c.execute("DELETE FROM questions WHERE id=?", (qid,))

conn.commit()

# Verify
remaining = c.execute(
    "SELECT COUNT(*) FROM questions WHERE topic_id=?", (topic_id,)
).fetchone()[0]
total_q = c.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
total_opt = c.execute("SELECT COUNT(*) FROM question_options").fetchone()[0]
total_i18n = c.execute("SELECT COUNT(*) FROM question_i18n").fetchone()[0]

print(f"Algebra questions remaining : {remaining}")
print(f"Total questions             : {total_q}")
print(f"Total options               : {total_opt}")
print(f"Total i18n rows             : {total_i18n}")
conn.close()
print("Cleanup complete.")
