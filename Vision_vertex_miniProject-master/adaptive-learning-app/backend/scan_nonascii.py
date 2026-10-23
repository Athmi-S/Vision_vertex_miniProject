"""scan_nonascii.py — Find question rows that contain non-ASCII characters."""
import sqlite3

conn = sqlite3.connect('vision.db')
c = conn.cursor()
rows = c.execute('SELECT id, question_text FROM questions ORDER BY id').fetchall()
found = 0
for r in rows:
    try:
        r[1].encode('ascii')
    except UnicodeEncodeError:
        print(f"id={r[0]} | {repr(r[1][:100])}")
        found += 1
conn.close()
if found == 0:
    print("All question texts are pure ASCII.")
else:
    print(f"\n{found} non-ASCII question(s) found.")
