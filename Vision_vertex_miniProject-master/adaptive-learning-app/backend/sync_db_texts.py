"""sync_db_texts.py — Update the 2 DB question texts to match seed_data.py exactly."""
import sqlite3
conn = sqlite3.connect('vision.db')
c = conn.cursor()

updates = [
    (
        "Five friends P, Q, R, S, T sit in a row. P sits next to Q. R is at one end. S is not next to R. T is in the middle. Who is at the other end from R?",
        "Five friends P, Q, R, S, T sit in a row. P sits next to Q. R sits at one end. S does not sit next to R. If T sits in the middle, who sits at the other end from R?",
    ),
    (
        "Which Fundamental Right under the Indian Constitution is also known as the Constitutional Remedy?",
        "Which Fundamental Right under the Indian Constitution is also known as the 'Constitutional Remedy'?",
    ),
]

for new_text, old_text in updates:
    qid = c.execute("SELECT id FROM questions WHERE question_text=?", (old_text,)).fetchone()
    if qid:
        c.execute("UPDATE questions    SET question_text=? WHERE id=?", (new_text, qid[0]))
        c.execute("UPDATE question_i18n SET question_text=? WHERE question_id=?", (new_text, qid[0]))
        print(f"Updated id={qid[0]}: {new_text[:60]}")
    else:
        print(f"NOT FOUND: {old_text[:60]}")

conn.commit()
conn.close()
print("Done.")
