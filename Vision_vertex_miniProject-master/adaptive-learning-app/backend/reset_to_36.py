"""
reset_to_36.py — Reset questions/options/i18n to exactly the 36 seeded rows.
Keep only the 6 lowest-ID questions per topic (the first good batch after cleanup).
"""
import sqlite3
conn = sqlite3.connect('vision.db')
conn.execute("PRAGMA foreign_keys = OFF")
c = conn.cursor()

topics = c.execute("SELECT id, name FROM topics").fetchall()
for topic_id, topic_name in topics:
    ids = [r[0] for r in c.execute(
        "SELECT id FROM questions WHERE topic_id=? ORDER BY id ASC", (topic_id,)
    ).fetchall()]
    keep = set(ids[:6])
    for qid in ids:
        if qid not in keep:
            c.execute("DELETE FROM question_options WHERE question_id=?", (qid,))
            c.execute("DELETE FROM question_i18n    WHERE question_id=?", (qid,))
            c.execute("DELETE FROM questions         WHERE id=?",          (qid,))

conn.commit()
for table in ['subjects','topics','questions','question_options','question_i18n']:
    n = c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"  {table:<22} {n:>4} rows")
conn.close()
print("Reset complete.")
