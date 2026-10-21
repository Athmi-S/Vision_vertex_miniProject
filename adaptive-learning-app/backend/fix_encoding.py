"""Fix Unicode characters in seed_data.py that cause cp1252 encoding errors."""
replacements = [
    ('\u2500', '-'),    # box-drawing horizontal line -> plain dash
    ('\u2019', "'"),    # right single quotation mark -> apostrophe
    ('\u2082', '2'),    # subscript 2
    ('\u2081', '1'),    # subscript 1
    ('\u00b2', '^2'),   # superscript 2
    ('\u00b3', '^3'),   # superscript 3
    ('\u221a', 'sqrt'), # square root symbol
    ('\u221d', 'proportional to'),
    ('\u00e9', 'e'),    # e acute (Andre)
    ('\u00e8', 'e'),    # e grave
    ('\u2019', "'"),
    ('\u201c', '"'),
    ('\u201d', '"'),
]

with open('seed_data.py', 'r', encoding='utf-8') as f:
    content = f.read()

for old, new in replacements:
    content = content.replace(old, new)

with open('seed_data.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done. Unicode characters replaced with ASCII equivalents.')
