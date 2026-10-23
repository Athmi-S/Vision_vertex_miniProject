"""check_new.py — Show which question texts in seed_data.py are NOT in the DB."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv; load_dotenv()
from app.database import SessionLocal
from app.models import Question, Topic

# Seed question texts
seed_texts = [
    "What is 15 + 27?",
    "Which of the following is a prime number?",
    "What is the LCM of 12 and 18?",
    "A shopkeeper buys an item for Rs.240 and sells it for Rs.300. What is the profit percentage?",
    "If 3x + 7 = 25, what is the value of 5x - 3?",
    "What is the remainder when 2^10 is divided by 7?",
    "What is the value of x in the equation x - 9 = 14?",
    "Which expression is equivalent to 3(a + 4)?",
    "What are the roots of the equation x^2 - 5x + 6 = 0?",
    "If f(x) = 2x^2 - 3x + 1, what is f(2)?",
    "For what value of k does the equation kx^2 - 6x + 1 = 0 have exactly one real root?",
    "What is the sum of all values of x satisfying |2x - 3| = 7?",
    "What is the area of a rectangle with length 8 cm and width 5 cm?",
    "How many degrees are in the sum of interior angles of a triangle?",
    "What is the circumference of a circle with radius 7 cm? (Use pi ~= 22/7)",
    "In a right-angled triangle, the two shorter sides are 3 cm and 4 cm. What is the hypotenuse?",
    "A cone has radius 3 cm and slant height 5 cm. What is its curved surface area? (Use pi ~= 3.14)",
    "Two circles have radii in the ratio 3:5. What is the ratio of their areas?",
    "What is the chemical symbol for water?",
    "Which planet is known as the Red Planet?",
    "What is the SI unit of electric current?",
    "Which gas is most abundant in the Earth's atmosphere?",
    "What phenomenon causes a rainbow to form?",
    "In which layer of the Earth's atmosphere does most weather occur?",
    "In which year did India gain independence?",
    "Who was the first President of India?",
    "Which article of the Indian Constitution abolishes untouchability?",
    "The Battle of Plassey (1757) was fought between the British East India Company and which Indian ruler?",
    "What was the main purpose of the Rowlatt Act (1919)?",
    "Which Fundamental Right under the Indian Constitution is also known as the Constitutional Remedy?",
    "What comes next in the series: 2, 4, 8, 16, ___?",
    "If all roses are flowers and some flowers fade quickly, which conclusion is definitely true?",
    "A clock shows 3:15. What is the angle between the hour and minute hands?",
    "In a row of students, Riya is 7th from the left and 11th from the right. How many students are in the row?",
    "Five friends P, Q, R, S, T sit in a row. P sits next to Q. R is at one end. S is not next to R. T is in the middle. Who is at the other end from R?",
    "If PENCIL is coded as RGPEKN, how is ERASER coded?",
]

db = SessionLocal()
db_texts = set(r[0] for r in db.query(Question.question_text).all())

print(f"DB has {len(db_texts)} question texts")
print(f"Seed has {len(seed_texts)} question texts")
print()
print("Seed texts NOT in DB:")
missing = [t for t in seed_texts if t not in db_texts]
for m in missing:
    print(f"  MISSING: {m!r}")

print()
print("DB texts NOT in seed:")
extra = [t for t in db_texts if t not in seed_texts]
for e in extra:
    print(f"  EXTRA:   {e!r}")

db.close()
