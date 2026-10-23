"""
seed_data.py — Sample learning content for VISION diagnostic assessment.
=========================================================================

Inserts subjects, topics, MCQ questions, answer options, and English
translation records into vision.db using the existing SQLAlchemy models.

Safe to run repeatedly: every insert is guarded by a "does it already
exist?" check using question_text, so re-running never creates duplicates.

All question text is plain ASCII to avoid Windows cp1252 encoding errors.

Usage (from the backend/ directory, with venv active):
    python seed_data.py

Content
-------
  2 subjects    : Mathematics, General Knowledge
  6 topics      : Arithmetic, Algebra, Geometry  (Maths)
                  Science & Technology, History & Civics, Logical Reasoning (GK)
  6 questions per topic across easy/medium/hard = 36 questions total
  4 options per question                         = 144 options total
  1 question_i18n record per question (English)  = 36 translation records
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal, engine, Base
from app.models import Subject, Topic, Question, QuestionOption, QuestionI18n

Base.metadata.create_all(bind=engine)


SUBJECTS = [
    {
        "name": "Mathematics",
        "code": "MATH",
        "topics": [
            {
                "name": "Arithmetic",
                "order_index": 1,
                "questions": [
                    {
                        "text": "What is 15 + 27?",
                        "difficulty": "easy",
                        "explanation": "15 + 27 = 42. Add units (5+7=12, carry 1) then tens (1+2+1=4).",
                        "options": [("40", False), ("42", True), ("44", False), ("38", False)],
                    },
                    {
                        "text": "Which of the following is a prime number?",
                        "difficulty": "easy",
                        "explanation": "A prime has exactly two factors: 1 and itself. 13 is prime; 9=3x3, 15=3x5, 21=3x7.",
                        "options": [("9", False), ("15", False), ("13", True), ("21", False)],
                    },
                    {
                        "text": "What is the LCM of 12 and 18?",
                        "difficulty": "medium",
                        "explanation": "12=2^2x3, 18=2x3^2. LCM = 2^2x3^2 = 36.",
                        "options": [("24", False), ("36", True), ("48", False), ("72", False)],
                    },
                    {
                        "text": "A shopkeeper buys an item for Rs.240 and sells it for Rs.300. What is the profit percentage?",
                        "difficulty": "medium",
                        "explanation": "Profit = 300-240 = 60. Profit% = (60/240)x100 = 25%.",
                        "options": [("20%", False), ("25%", True), ("30%", False), ("15%", False)],
                    },
                    {
                        "text": "If 3x + 7 = 25, what is the value of 5x - 3?",
                        "difficulty": "hard",
                        "explanation": "3x=18, so x=6. Then 5(6)-3 = 30-3 = 27.",
                        "options": [("24", False), ("27", True), ("30", False), ("33", False)],
                    },
                    {
                        "text": "What is the remainder when 2^10 is divided by 7?",
                        "difficulty": "hard",
                        "explanation": "2^1=2, 2^2=4, 2^3=1 (mod 7). Pattern repeats period 3. 10=3x3+1, so 2^10 = 2 (mod 7).",
                        "options": [("1", False), ("2", True), ("4", False), ("6", False)],
                    },
                ],
            },
            {
                "name": "Algebra",
                "order_index": 2,
                "questions": [
                    {
                        "text": "What is the value of x in the equation x - 9 = 14?",
                        "difficulty": "easy",
                        "explanation": "x = 14 + 9 = 23.",
                        "options": [("5", False), ("23", True), ("19", False), ("25", False)],
                    },
                    {
                        "text": "Which expression is equivalent to 3(a + 4)?",
                        "difficulty": "easy",
                        "explanation": "Distribute: 3xa + 3x4 = 3a + 12.",
                        "options": [("3a + 4", False), ("3a + 12", True), ("a + 12", False), ("3a + 7", False)],
                    },
                    {
                        "text": "What are the roots of the equation x^2 - 5x + 6 = 0?",
                        "difficulty": "medium",
                        "explanation": "Factorise: (x-2)(x-3)=0. Roots are x=2 and x=3.",
                        "options": [
                            ("x = 1 and x = 6", False),
                            ("x = 2 and x = 3", True),
                            ("x = -2 and x = -3", False),
                            ("x = 3 and x = 4", False),
                        ],
                    },
                    {
                        "text": "If f(x) = 2x^2 - 3x + 1, what is f(2)?",
                        "difficulty": "medium",
                        "explanation": "f(2) = 2(4) - 3(2) + 1 = 8 - 6 + 1 = 3.",
                        "options": [("1", False), ("3", True), ("5", False), ("7", False)],
                    },
                    {
                        "text": "For what value of k does the equation kx^2 - 6x + 1 = 0 have exactly one real root?",
                        "difficulty": "hard",
                        "explanation": "Discriminant = 36 - 4k = 0 gives k = 9.",
                        "options": [("6", False), ("9", True), ("12", False), ("3", False)],
                    },
                    {
                        "text": "What is the sum of all values of x satisfying |2x - 3| = 7?",
                        "difficulty": "hard",
                        "explanation": "2x-3=7 gives x=5; 2x-3=-7 gives x=-2. Sum = 5+(-2) = 3.",
                        "options": [("3", True), ("5", False), ("7", False), ("-2", False)],
                    },
                ],
            },
            {
                "name": "Geometry",
                "order_index": 3,
                "questions": [
                    {
                        "text": "What is the area of a rectangle with length 8 cm and width 5 cm?",
                        "difficulty": "easy",
                        "explanation": "Area = length x width = 8 x 5 = 40 cm^2.",
                        "options": [("26 cm^2", False), ("40 cm^2", True), ("13 cm^2", False), ("45 cm^2", False)],
                    },
                    {
                        "text": "How many degrees are in the sum of interior angles of a triangle?",
                        "difficulty": "easy",
                        "explanation": "The interior angles of any triangle always sum to 180 degrees.",
                        "options": [("90 degrees", False), ("180 degrees", True), ("270 degrees", False), ("360 degrees", False)],
                    },
                    {
                        "text": "What is the circumference of a circle with radius 7 cm? (Use pi ~= 22/7)",
                        "difficulty": "medium",
                        "explanation": "C = 2 x pi x r = 2 x (22/7) x 7 = 44 cm.",
                        "options": [("22 cm", False), ("44 cm", True), ("154 cm", False), ("88 cm", False)],
                    },
                    {
                        "text": "In a right-angled triangle, the two shorter sides are 3 cm and 4 cm. What is the hypotenuse?",
                        "difficulty": "medium",
                        "explanation": "By Pythagoras: h = sqrt(3^2+4^2) = sqrt(9+16) = sqrt(25) = 5 cm.",
                        "options": [("6 cm", False), ("5 cm", True), ("7 cm", False), ("4.5 cm", False)],
                    },
                    {
                        "text": "A cone has radius 3 cm and slant height 5 cm. What is its curved surface area? (Use pi ~= 3.14)",
                        "difficulty": "hard",
                        "explanation": "CSA = pi x r x l = 3.14 x 3 x 5 = 47.1 cm^2.",
                        "options": [("94.2 cm^2", False), ("47.1 cm^2", True), ("37.68 cm^2", False), ("56.52 cm^2", False)],
                    },
                    {
                        "text": "Two circles have radii in the ratio 3:5. What is the ratio of their areas?",
                        "difficulty": "hard",
                        "explanation": "Area is proportional to r^2. Ratio = 3^2 : 5^2 = 9:25.",
                        "options": [("3:5", False), ("9:25", True), ("6:10", False), ("27:125", False)],
                    },
                ],
            },
        ],
    },
    {
        "name": "General Knowledge",
        "code": "GK",
        "topics": [
            {
                "name": "Science & Technology",
                "order_index": 1,
                "questions": [
                    {
                        "text": "What is the chemical symbol for water?",
                        "difficulty": "easy",
                        "explanation": "Water is composed of two hydrogen atoms and one oxygen atom: H2O.",
                        "options": [("HO", False), ("H2O", True), ("CO2", False), ("O2", False)],
                    },
                    {
                        "text": "Which planet is known as the Red Planet?",
                        "difficulty": "easy",
                        "explanation": "Mars appears red due to iron oxide (rust) on its surface.",
                        "options": [("Venus", False), ("Mars", True), ("Jupiter", False), ("Saturn", False)],
                    },
                    {
                        "text": "What is the SI unit of electric current?",
                        "difficulty": "medium",
                        "explanation": "The ampere (A) is the SI base unit for electric current.",
                        "options": [("Volt", False), ("Ampere", True), ("Ohm", False), ("Watt", False)],
                    },
                    {
                        "text": "Which gas is most abundant in the Earth's atmosphere?",
                        "difficulty": "medium",
                        "explanation": "Nitrogen makes up approximately 78% of the Earth's atmosphere.",
                        "options": [("Oxygen", False), ("Nitrogen", True), ("Carbon dioxide", False), ("Argon", False)],
                    },
                    {
                        "text": "What phenomenon causes a rainbow to form?",
                        "difficulty": "hard",
                        "explanation": "A rainbow forms due to refraction on entry, internal reflection, and refraction on exit of sunlight in water droplets.",
                        "options": [
                            ("Diffraction and absorption", False),
                            ("Refraction, internal reflection, and dispersion", True),
                            ("Reflection and polarisation", False),
                            ("Scattering only", False),
                        ],
                    },
                    {
                        "text": "In which layer of the Earth's atmosphere does most weather occur?",
                        "difficulty": "hard",
                        "explanation": "The troposphere (0-12 km) is where clouds, rain, and most weather occur.",
                        "options": [("Stratosphere", False), ("Troposphere", True), ("Mesosphere", False), ("Thermosphere", False)],
                    },
                ],
            },
            {
                "name": "History & Civics",
                "order_index": 2,
                "questions": [
                    {
                        "text": "In which year did India gain independence?",
                        "difficulty": "easy",
                        "explanation": "India became independent on 15 August 1947.",
                        "options": [("1942", False), ("1947", True), ("1950", False), ("1935", False)],
                    },
                    {
                        "text": "Who was the first President of India?",
                        "difficulty": "easy",
                        "explanation": "Dr Rajendra Prasad served as the first President of India from 1950 to 1962.",
                        "options": [("Jawaharlal Nehru", False), ("Rajendra Prasad", True), ("Sardar Patel", False), ("B.R. Ambedkar", False)],
                    },
                    {
                        "text": "Which article of the Indian Constitution abolishes untouchability?",
                        "difficulty": "medium",
                        "explanation": "Article 17 abolishes untouchability and forbids its practice in any form.",
                        "options": [("Article 14", False), ("Article 17", True), ("Article 21", False), ("Article 32", False)],
                    },
                    {
                        "text": "The Battle of Plassey (1757) was fought between the British East India Company and which Indian ruler?",
                        "difficulty": "medium",
                        "explanation": "Siraj ud-Daulah, Nawab of Bengal, was defeated by Robert Clive at Plassey.",
                        "options": [("Hyder Ali", False), ("Siraj ud-Daulah", True), ("Tipu Sultan", False), ("Shah Alam II", False)],
                    },
                    {
                        "text": "What was the main purpose of the Rowlatt Act (1919)?",
                        "difficulty": "hard",
                        "explanation": "The Rowlatt Act authorised the colonial government to imprison people without trial to suppress political dissent.",
                        "options": [
                            ("To grant voting rights to Indians", False),
                            ("To allow imprisonment without trial to suppress dissent", True),
                            ("To introduce the dyarchy system of governance", False),
                            ("To separate Burma from British India", False),
                        ],
                    },
                    {
                        "text": "Which Fundamental Right under the Indian Constitution is also known as the Constitutional Remedy?",
                        "difficulty": "hard",
                        "explanation": "Article 32 gives citizens the right to approach the Supreme Court for enforcement of Fundamental Rights.",
                        "options": [("Article 19", False), ("Article 32", True), ("Article 21", False), ("Article 44", False)],
                    },
                ],
            },
            {
                "name": "Logical Reasoning",
                "order_index": 3,
                "questions": [
                    {
                        "text": "What comes next in the series: 2, 4, 8, 16, ___?",
                        "difficulty": "easy",
                        "explanation": "Each term is doubled: 16x2=32.",
                        "options": [("24", False), ("32", True), ("28", False), ("18", False)],
                    },
                    {
                        "text": "If all roses are flowers and some flowers fade quickly, which conclusion is definitely true?",
                        "difficulty": "easy",
                        "explanation": "Since all roses are flowers, roses belong to the flower category.",
                        "options": [
                            ("All roses fade quickly", False),
                            ("Some flowers are roses", True),
                            ("No roses fade quickly", False),
                            ("All flowers are roses", False),
                        ],
                    },
                    {
                        "text": "A clock shows 3:15. What is the angle between the hour and minute hands?",
                        "difficulty": "medium",
                        "explanation": "Minute hand at 90 degrees. Hour hand at 3h15m = 97.5 degrees. Angle = 7.5 degrees.",
                        "options": [("0 degrees", False), ("7.5 degrees", True), ("15 degrees", False), ("30 degrees", False)],
                    },
                    {
                        "text": "In a row of students, Riya is 7th from the left and 11th from the right. How many students are in the row?",
                        "difficulty": "medium",
                        "explanation": "Total = position from left + position from right - 1 = 7 + 11 - 1 = 17.",
                        "options": [("16", False), ("17", True), ("18", False), ("19", False)],
                    },
                    {
                        "text": "Five friends P, Q, R, S, T sit in a row. P sits next to Q. R is at one end. S is not next to R. T is in the middle. Who is at the other end from R?",
                        "difficulty": "hard",
                        "explanation": "Valid arrangement: R, Q, T, P, S. Other end = S.",
                        "options": [("P", False), ("S", True), ("Q", False), ("T", False)],
                    },
                    {
                        "text": "If PENCIL is coded as RGPEKN, how is ERASER coded?",
                        "difficulty": "hard",
                        "explanation": "Each letter shifts +2: E->G, R->T, A->C, S->U, E->G, R->T. Code = GTCUGT.",
                        "options": [("GRCUGT", False), ("GTCUGT", True), ("FTCUGT", False), ("GTCVGT", False)],
                    },
                ],
            },
        ],
    },
]


def seed(db):
    counts = {"subjects": 0, "topics": 0, "questions": 0, "options": 0,
              "translations": 0, "skipped_subjects": 0, "skipped_topics": 0,
              "skipped_questions": 0}

    for subj_data in SUBJECTS:
        subject = db.query(Subject).filter_by(code=subj_data["code"]).first()
        if subject is None:
            subject = Subject(name=subj_data["name"], code=subj_data["code"])
            db.add(subject)
            db.flush()
            counts["subjects"] += 1
            print(f"  + Subject: {subj_data['name']}")
        else:
            counts["skipped_subjects"] += 1
            print(f"  ~ Subject already exists: {subj_data['name']}")

        for topic_data in subj_data["topics"]:
            topic = db.query(Topic).filter_by(
                subject_id=subject.id, name=topic_data["name"]
            ).first()
            if topic is None:
                topic = Topic(subject_id=subject.id, name=topic_data["name"],
                              order_index=topic_data["order_index"])
                db.add(topic)
                db.flush()
                counts["topics"] += 1
                print(f"    + Topic: {topic_data['name']}")
            else:
                counts["skipped_topics"] += 1
                print(f"    ~ Topic already exists: {topic_data['name']}")

            for q_data in topic_data["questions"]:
                question = db.query(Question).filter_by(
                    topic_id=topic.id, question_text=q_data["text"]
                ).first()
                if question is not None:
                    counts["skipped_questions"] += 1
                    continue

                question = Question(
                    topic_id=topic.id,
                    question_text=q_data["text"],
                    question_type="mcq",
                    difficulty=q_data["difficulty"],
                    is_active=True,
                    created_by=None,
                )
                db.add(question)
                db.flush()
                counts["questions"] += 1

                for opt_text, is_correct in q_data["options"]:
                    db.add(QuestionOption(
                        question_id=question.id,
                        option_text=opt_text,
                        is_correct=is_correct,
                    ))
                    counts["options"] += 1

                db.add(QuestionI18n(
                    question_id=question.id,
                    language_code="en",
                    question_text=q_data["text"],
                    explanation=q_data.get("explanation"),
                ))
                counts["translations"] += 1

    db.commit()
    return counts


def verify(db):
    from app.models import QuestionOption as QO, QuestionI18n as QI18
    print("\n--- Verification -------------------------------------------")
    rows = [
        ("subjects",         db.query(Subject).count()),
        ("topics",           db.query(Topic).count()),
        ("questions",        db.query(Question).count()),
        ("question_options", db.query(QO).count()),
        ("question_i18n",    db.query(QI18).count()),
    ]
    for table, count in rows:
        print(f"  {table:<22} {count:>4} rows")
    print("------------------------------------------------------------")
    return rows


if __name__ == "__main__":
    print("\nVISION Seed Data Script")
    print("=" * 40)
    db = SessionLocal()
    try:
        print("\nInserting seed data...\n")
        counts = seed(db)
        print("\n--- Summary ------------------------------------------------")
        print(f"  Subjects  inserted : {counts['subjects']:>3}   skipped: {counts['skipped_subjects']}")
        print(f"  Topics    inserted : {counts['topics']:>3}   skipped: {counts['skipped_topics']}")
        print(f"  Questions inserted : {counts['questions']:>3}   skipped: {counts['skipped_questions']}")
        print(f"  Options   inserted : {counts['options']:>3}")
        print(f"  i18n rows inserted : {counts['translations']:>3}")
        verify(db)
        print("\nDone. vision.db is ready for diagnostic assessment.\n")
    except Exception as e:
        db.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        db.close()
