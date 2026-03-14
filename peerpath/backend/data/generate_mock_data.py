"""
Generate 200 mock peer profiles (peer_011 – peer_210) and rebuild index.json.
Run from the backend/data/ directory:
    python3 generate_mock_data.py
"""

import json
import os
import random

random.seed(42)

# ── Enum pools (must match llm_parser / scorer valid values) ─────────────────

CONTEXTS = [
    "transfer adjustment", "freshman adjustment", "academic stress",
    "course registration", "campus navigation", "social life",
    "dating", "internship search", "research decisions",
    "housing", "international student adjustment", "changing majors",
]

STRUGGLE_TYPES = [
    "social isolation", "procedural confusion", "academic difficulty",
    "anxiety", "burnout", "lack of information", "difficulty adapting",
    "relationship confusion", "time management", "financial stress",
]

EMOTIONAL_SIGNALS = [
    "lonely", "overwhelmed", "frustrated", "uncertain",
    "anxious", "lost", "stressed", "hopeful", "confused",
]

RESOLUTION_TYPES = [
    "reassurance", "step-by-step advice", "peer experience",
    "practical tips", "emotional support", "introductions to people",
    "information about resources",
]

YEARS = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"]

MAJORS = [
    "Computer Science", "Psychology", "Biology", "Economics",
    "Mechanical Engineering", "English Literature", "Political Science",
    "Chemistry", "Sociology", "Mathematics", "Nursing", "Business Administration",
    "Environmental Science", "Communications", "Philosophy", "Data Science",
    "Electrical Engineering", "Art History", "Public Health", "Finance",
]

FIRST_NAMES = [
    "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn",
    "Skylar", "Peyton", "Drew", "Reese", "Finley", "Harley", "Blake", "Cameron",
    "Dana", "Emery", "Frankie", "Glen", "Hayden", "Indigo", "Jesse", "Kendall",
    "Lane", "Micah", "Noel", "Oakley", "Parker", "Remy", "Sage", "Tatum",
    "Uma", "Val", "Wren", "Xen", "Yael", "Zion", "Amari", "Briar",
    "Cleo", "Devon", "Ellis", "Fern", "Gray", "Haven", "Ira", "Jules",
]

TAGS_POOL = [
    "transfer student", "making friends", "joining clubs",
    "freshman adjustment", "academic stress", "time management",
    "course registration", "campus navigation", "social anxiety",
    "dating", "social life", "international student adjustment",
    "burnout", "research decisions", "changing majors",
    "internship search", "anxiety", "housing", "financial stress",
    "study skills", "mental health", "career planning",
]

# ── Raw experience templates ─────────────────────────────────────────────────

RAW_TEMPLATES = {
    ("transfer adjustment", "social isolation"): [
        "I transferred in {year_in} and felt completely disconnected. Everyone already had their friend groups and I spent the first few weeks eating lunch alone. It took time but I eventually found my community through {activity}.",
        "Transferring mid-year was harder than I expected. The campus felt huge and unfamiliar, and I didn't know how to meet people who weren't in my immediate classes. I reached out to my academic advisor and that helped me find some student orgs.",
        "When I transferred as a {student_year}, I felt like an outsider at every event. I kept comparing myself to people who had been here since freshman year. Eventually I stopped comparing and just focused on finding one or two genuine connections.",
    ],
    ("freshman adjustment", "anxiety"): [
        "My first semester was rough. I thought college would feel like the movies but instead I was overwhelmed by the independence and had no idea how to manage my time or talk to professors.",
        "As a freshman, I was so anxious about everything — classes, making friends, navigating the dining hall alone. I called home a lot. Slowly things got better as I found my routine.",
        "I didn't sleep well for the first two months. Every small thing stressed me out. Joining a study group made a huge difference because I realized everyone else was struggling too.",
    ],
    ("academic stress", "burnout"): [
        "Junior year almost broke me. I was taking 18 credits, interning part-time, and trying to maintain a social life. I burned out completely by November and had to drop a class.",
        "I hit a wall sophomore year where nothing felt meaningful anymore. I was grinding but not retaining anything. Taking a weekend completely offline helped me reset.",
        "I used to think struggling academically meant I didn't belong here. Eventually a professor told me to talk to the academic support center and that changed everything.",
    ],
    ("course registration", "procedural confusion"): [
        "Registration was a nightmare. I had no idea about prerequisite chains or how to get a permission code. I ended up in totally the wrong sequence and had to retake a prereq.",
        "Nobody told me that registration appointments open at 7am or that some popular courses fill in 3 minutes. I had to learn all of this the hard way in my first semester.",
        "I wasted a semester in a class I didn't need because I misread the major requirements. The registrar's office actually has office hours — I wish I had gone sooner.",
    ],
    ("campus navigation", "lack of information"): [
        "I wandered around for 20 minutes trying to find my first class. The campus map app was useless. I ended up just asking random students and everyone was surprisingly helpful.",
        "Nobody told me about the hidden study spots, the free printing in the library basement, or which dining halls have late hours. It all took months to discover by accident.",
        "Finding campus resources took way longer than it should have. The counseling center, food pantry, tutoring — they exist but they're buried on the website.",
    ],
    ("social life", "difficulty adapting"): [
        "I'm naturally introverted so the party-heavy social scene felt totally wrong for me. It took me a while to accept that my social style was valid and to find low-key communities that fit.",
        "Greek life dominated the social scene here and I had no interest in rushing. It felt isolating until I found the people who also wanted a quieter version of college social life.",
        "My social life in high school was very different. Here everything felt performative and exhausting at first. I learned to be more selective about where I spent my energy.",
    ],
    ("dating", "relationship confusion"): [
        "Dating in college is nothing like I imagined. Nobody defines relationships, everyone's casual about things, and I felt totally lost about what was even happening half the time.",
        "I got into a situationship that left me confused for months. Talking to older students who had been through it helped me understand what I actually wanted.",
        "Navigating dating while managing coursework and friendships was genuinely hard. I had to learn to communicate directly about what I wanted, which was uncomfortable at first.",
    ],
    ("internship search", "anxiety"): [
        "Watching everyone else get internships while I was still working on my resume felt terrible. I applied to 40 places before I got my first interview. It's more of a numbers game than people admit.",
        "I had no idea how to network. LinkedIn felt fake and cold emails felt awkward. A career counselor helped me reframe networking as just having genuine conversations.",
        "My first internship rejection came with no feedback. I spiraled for a week. Eventually I found a peer mentor in my major who walked me through what interviewers actually look for.",
    ],
    ("research decisions", "uncertainty"): [
        "Deciding whether to pursue research or go straight to industry was genuinely hard. I talked to grad students, professors, and alumni before I felt clear enough to commit to a direction.",
        "I joined a research lab sophomore year and quickly realized it wasn't what I expected. Knowing when to leave and what to do next took a lot of reflection and conversation.",
        "My advisor kept pushing grad school but I wasn't sure. I did informational interviews with people in industry and that helped me make a decision I actually felt good about.",
    ],
    ("housing", "financial stress"): [
        "Off-campus housing was way more expensive than I expected and the landlord market here is chaotic. I ended up in a bad living situation for a semester before finding something stable.",
        "I didn't know about subletting options or university-affiliated housing until my junior year. I overpaid for two years out of ignorance.",
        "Finding roommates from scratch was stressful. Facebook groups and the housing board helped but it still took weeks of searching and a few sketchy tours.",
    ],
    ("international student adjustment", "difficulty adapting"): [
        "Adjusting to a completely different academic culture was harder than the language barrier. Back home everything was lecture-based, so being asked for my opinion in seminars felt shocking.",
        "I had to rebuild my entire social framework from scratch. My home culture had very different norms around friendship and it took me a while to understand what was normal here.",
        "Simple things like grocery shopping, banking, and healthcare were confusing at first. The international student office was helpful but I wish I had connected with other international students sooner.",
    ],
    ("changing majors", "uncertainty"): [
        "Switching majors sophomore year felt like admitting failure. But staying in a field I hated would have been worse. The switch cost me a summer of catch-up but I'm genuinely happier.",
        "I changed my major three times before landing somewhere that felt right. Every advisor I talked to made me feel judged for it, but my peers were way more understanding.",
        "I spent a year in a major my parents chose before admitting I was miserable. The conversation with my family was hard but necessary. I found a double-major path that worked for both of us.",
    ],
}

# ── Helper functions ─────────────────────────────────────────────────────────

def pick_raw(context: str, struggle_type: str) -> str:
    key = (context, struggle_type)
    # Fallback to any matching context key
    options = RAW_TEMPLATES.get(key)
    if not options:
        for k, v in RAW_TEMPLATES.items():
            if k[0] == context:
                options = v
                break
    if not options:
        options = [
            f"I went through a tough period related to {context} and {struggle_type}. "
            "It was challenging but I came out with a lot of practical insight I'm happy to share."
        ]
    template = random.choice(options)
    return template.format(
        year_in=random.choice(["sophomore", "junior", "mid-year"]),
        activity=random.choice(["a club", "a study group", "a part-time job", "an org fair"]),
        student_year=random.choice(["sophomore", "junior"]),
    )


def make_challenge(context: str = None, struggle: str = None) -> dict:
    ctx = context or random.choice(CONTEXTS)
    st  = struggle or random.choice(STRUGGLE_TYPES)
    return {
        "raw": pick_raw(ctx, st),
        "parsed": {
            "context":          ctx,
            "struggle_type":    st,
            "emotional_signal": random.choice(EMOTIONAL_SIGNALS),
            "resolution_type":  random.choice(RESOLUTION_TYPES),
        },
    }


def make_peer(peer_id: str, name: str) -> dict:
    primary_context  = random.choice(CONTEXTS)
    primary_struggle = random.choice(STRUGGLE_TYPES)

    # 1–2 past challenges, first one matches primary context
    n_challenges = random.randint(1, 2)
    challenges = [make_challenge(primary_context, primary_struggle)]
    if n_challenges == 2:
        challenges.append(make_challenge())

    # Tags: 2–4, seeded from context
    context_tag_map = {
        "transfer adjustment":           "transfer student",
        "freshman adjustment":           "freshman adjustment",
        "academic stress":               "academic stress",
        "course registration":           "course registration",
        "campus navigation":             "campus navigation",
        "social life":                   "social life",
        "dating":                        "dating",
        "internship search":             "internship search",
        "research decisions":            "research decisions",
        "housing":                       "housing",
        "international student adjustment": "international student adjustment",
        "changing majors":               "changing majors",
    }
    primary_tag = context_tag_map.get(primary_context, primary_context)
    extra_tags  = random.sample(
        [t for t in TAGS_POOL if t != primary_tag],
        k=random.randint(1, 3),
    )
    tags = list(dict.fromkeys([primary_tag] + extra_tags))  # dedupe, preserve order

    return {
        "id":    peer_id,
        "name":  name,
        "major": random.choice(MAJORS),
        "year":  random.choice(YEARS),
        "tags":  tags,
        "past_challenges": challenges,
        "help_topics":     list(dict.fromkeys([primary_context] + [c["parsed"]["context"] for c in challenges])),
        "comfort_level":   random.choice(["open to messages", "open to messages", "prefers intro message"]),
    }


# ── Generate files ───────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    peers_dir  = os.path.join(script_dir, "peers")
    index_path = os.path.join(script_dir, "index.json")

    # Load existing index entries (peer_001 – peer_010)
    with open(index_path, "r", encoding="utf-8") as f:
        index: list = json.load(f)

    existing_ids = {entry["id"] for entry in index}

    names_cycle = FIRST_NAMES * 10  # enough for 200 unique slots
    name_idx    = 0

    generated = 0
    for n in range(11, 211):          # 011 → 210  (200 new peers)
        peer_id = f"peer_{n:03d}"
        if peer_id in existing_ids:
            continue

        name = names_cycle[name_idx % len(names_cycle)]
        name_idx += 1

        peer = make_peer(peer_id, name)

        # Write individual JSON
        out_path = os.path.join(peers_dir, f"{peer_id}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(peer, f, indent=2, ensure_ascii=False)

        # Append to index
        index.append({"id": peer_id, "tags": peer["tags"]})
        generated += 1

    # Rewrite index.json
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    print(f"✅  Generated {generated} new peer files  →  peers/ directory")
    print(f"✅  index.json updated  →  {len(index)} total peers")


if __name__ == "__main__":
    main()
