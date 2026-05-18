import requests
from bs4 import BeautifulSoup
import json
import os
import time

# 1. THE CONFIGURATION ENGINE
configs = [
    # --- Singles (No Ranges) ---
    ("ciceroaratea", 0, 0, "Cicero", "Aratea", "Aratea", True),
    ("columella10", 0, 0, "Columella", "De Re Rustica", "Book X", True),
    ("germanicus", 0, 0, "Germanicus", "Aratea", "Aratea", True),
    ("grattius", 0, 0, "Grattius", "Cynegetica", "Cynegetica", True),
    ("arspoetica", 0, 0, "Horace", "Ars Poetica", "Ars Poetica", True),
    ("remedia", 0, 0, "Ovid", "Remedia Amoris", "Remedia Amoris", True),
    ("ibis", 0, 0, "Ovid", "Ibis", "Ibis", True),
    ("medicaminfac", 0, 0, "Ovid", "Medicamina", "Medicamina", True),
    ("petroniusbc", 0, 0, "Petronius", "Bellum Civile", "Bellum Civile", True),

    # Singles that are Collections of Poems
    ("calpurnius", 0, 0, "Calpurnius Siculus", "Eclogues", "Eclogue {n}", False),
    ("catullus", 0, 0, "Catullus", "Carmina", "Poem {n}", False),
    ("ennius", 0, 0, "Ennius", "Annales", "Fragment {n}", False),
    ("epodes", 0, 0, "Horace", "Epodes", "Epode {n}", False),
    ("persius", 0, 0, "Persius", "Satires", "Satire {n}", False),
    ("petronius2", 0, 0, "Petronius", "Other Poems", "Poem {n}", False),

    # --- Ranges (Books with 1..X URLs) ---
    # Epics & Continuous Books (Merge=True)
    ("juvenal", 1, 16, "Juvenal", "Satires", "Satire {i}", True),
    ("lucan", 1, 10, "Lucan", "Bellum Civile", "Book {i}", True),
    ("lucretius", 1, 6, "Lucretius", "De Rerum Natura", "Book {i}", True),
    ("manilius", 1, 5, "Manilius", "Astronomica", "Book {i}", True),
    ("met", 1, 15, "Ovid", "Metamorphoses", "Book {i}", True),
    ("ars", 1, 3, "Ovid", "Ars Amatoria", "Book {i}", True),
    ("fasti", 1, 6, "Ovid", "Fasti", "Book {i}", True),
    ("heroides", 1, 21, "Ovid", "Heroides", "Epistle {i}", True),
    ("phaedrus", 1, 5, "Phaedrus", "Fabulae", "Book {i}", True),
    ("aen", 1, 12, "Virgil", "Aeneid", "Book {i}", True),
    ("geo", 1, 4, "Virgil", "Georgics", "Book {i}", True),
    ("eclogue", 1, 10, "Virgil", "Eclogues", "Eclogue {i}", True),
    ("vflaccus", 1, 8, "Valerius Flaccus", "Argonautica", "Book {i}", True),
    ("achilleid", 1, 2, "Statius", "Achilleid", "Book {i}", True),
    ("thebaid", 1, 12, "Statius", "Thebaid", "Book {i}", True),

    # Poem Collections spanning multiple URLs (Merge=False)
    ("odes", 1, 4, "Horace", "Odes", "Book {i}, Ode {n}", False),
    ("sermones", 1, 2, "Horace", "Sermones", "Book {i}, Satire {n}", False),
    ("epistulae", 1, 2, "Horace", "Epistulae", "Book {i}, Epistle {n}", False),
    ("martial", 1, 14, "Martial", "Epigrams", "Book {i}, Epigram {n}", False),
    ("amores", 1, 3, "Ovid", "Amores", "Book {i}, Poem {n}", False),
    ("tristia", 1, 5, "Ovid", "Tristia", "Book {i}, Poem {n}", False),
    ("ponto", 1, 4, "Ovid", "Ex Ponto", "Book {i}, Poem {n}", False),
    ("tibullus", 1, 3, "Tibullus", "Poems", "Book {i}, Poem {n}", False),
    ("silvae", 1, 5, "Statius", "Silvae", "Book {i}, Poem {n}", False),
]

AUTHOR_MAP = {}
for prefix, start, end, author, work, template, merge in configs:
    if start == 0 and end == 0:
        AUTHOR_MAP[prefix] = {"author": author, "work": work, "template": template, "merge": merge, "i": ""}
    else:
        for i in range(start, end + 1):
            AUTHOR_MAP[f"{prefix}{i}"] = {"author": author, "work": work, "template": template, "merge": merge, "i": str(i)}

authors_data = {}
library_index = {}

print(f"Beginning scrape of {len(AUTHOR_MAP)} pages...")

for target, meta in AUTHOR_MAP.items():
    url = f"https://hypotactic.com/latin/{target}.html"
    print(f"Fetching {url}...")
    
    response = requests.get(url)
    if response.status_code != 200:
        print(f"  -> Failed. Skipping...")
        continue
        
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # NEW: Isolate the actual content container to avoid ghost sidebars!
    latin_container = soup.find(class_='latin')
    if latin_container:
        poems = latin_container.find_all(class_='poem')
    else:
        poems = soup.find_all(class_='poem')
    
    author = meta["author"]
    work = meta["work"]
    
    if author not in authors_data: authors_data[author] = []
    if author not in library_index: library_index[author] = {}
    if work not in library_index[author]: library_index[author][work] = []

    if meta["merge"]:
        text_lines, scansion_lines = [], []
        for poem in poems:
            for line in poem.find_all(class_='line'):
                l_text, l_scan = [], []
                for word in line.find_all(class_='word'):
                    l_text.append(word.get_text().strip())
                    s_str = "".join([" " if 'elided' in s.get('class',[]) else "—" if 'long' in s.get('class',[]) else "∪" for s in word.find_all(class_='syll')])
                    l_scan.append(s_str)
                text_lines.append(" ".join(l_text))
                scansion_lines.append(l_scan)
        
        piece_name = meta["template"].replace("{i}", meta["i"])
        unique_id = target
        
        library_index[author][work].append({"id": unique_id, "piece": piece_name})
        authors_data[author].append({
            "id": unique_id, "author": author, "work": work, "piece": piece_name,
            "text": "\n".join(text_lines), "scansion": scansion_lines
        })
    else:
        for idx, poem in enumerate(poems):
            poem_number = poem.get('data-number', str(idx + 1))
            piece_name = meta["template"].replace("{i}", meta["i"]).replace("{n}", poem_number)
            unique_id = f"{target}-{poem_number}"
            
            text_lines, scansion_lines = [], []
            for line in poem.find_all(class_='line'):
                l_text, l_scan = [], []
                for word in line.find_all(class_='word'):
                    l_text.append(word.get_text().strip())
                    s_str = "".join([" " if 'elided' in s.get('class',[]) else "—" if 'long' in s.get('class',[]) else "∪" for s in word.find_all(class_='syll')])
                    l_scan.append(s_str)
                text_lines.append(" ".join(l_text))
                scansion_lines.append(l_scan)

            library_index[author][work].append({"id": unique_id, "piece": piece_name})
            authors_data[author].append({
                "id": unique_id, "author": author, "work": work, "piece": piece_name,
                "text": "\n".join(text_lines), "scansion": scansion_lines
            })
            
    time.sleep(0.5)

script_dir = os.path.dirname(os.path.abspath(__file__))
lib_dir = os.path.normpath(os.path.join(script_dir, "..", "public", "library"))
os.makedirs(lib_dir, exist_ok=True)

with open(os.path.join(lib_dir, "index.json"), 'w', encoding='utf-8') as f:
    json.dump(library_index, f, ensure_ascii=False, indent=2)

for author, data in authors_data.items():
    safe_filename = author.lower().replace(" ", "_") + ".json"
    with open(os.path.join(lib_dir, safe_filename), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("\nSuccess! Database regenerated with pure content.")