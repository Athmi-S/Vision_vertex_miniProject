"""fix_pi_approx.py — Replace U+2248 (approx equals) with ~= in question text."""
import sqlite3
conn = sqlite3.connect('vision.db')
c = conn.cursor()
rows = c.execute("SELECT id, question_text FROM questions WHERE question_text LIKE '%?%'").fetchall()
# Get all rows and fix the approx symbol
all_rows = c.execute("SELECT id, question_text FROM questions").fetchall()
updated = 0
for qid, text in all_rows:
    new = text.replace('\u2248', '~=')
    if new != text:
        c.execute("UPDATE questions SET question_text=? WHERE id=?", (new, qid))
        c.execute("UPDATE question_i18n SET question_text=? WHERE question_id=?", (new, qid))
        updated += 1
        print(f"Fixed id={qid}: {new[:70]}")
conn.commit()
conn.close()
print(f"Updated {updated} row(s).")
