# PeerPath – AI Peer Matching for Campus Challenges

> Connect with peers who've been through exactly what you're facing.

🎥 **[Watch Demo on YouTube](https://youtu.be/g6IgdsiZmDY)**

---

## Inspiration

College is full of moments where you feel completely alone — transferring to a new campus, burning out mid-semester, navigating dating, housing, or just not knowing who to talk to. Existing resources either feel too heavy (counselors) or too impersonal (forums and Reddit threads).

The most helpful person for a struggling student is almost always another student who has been through the exact same thing. **PeerPath** was built to make that connection happen: quickly, warmly, and without awkwardness.

---

## What It Does

PeerPath is a web platform that matches students going through a hard moment with peers who have lived through something genuinely similar.

### 🔍 Peer Matching
- Students describe their situation in their own words and select relevant tags (e.g. `transfer student`, `burnout`, `housing stress`)
- PeerPath analyzes the description and finds peers whose past experiences best match the student's context, emotional state, and the kind of support they need
- Returns the **top 3 matches**, each with a clear explanation of why they were chosen

### 💬 Conversation Starters
- Every match comes with an AI-generated opening message — personal, warm, and ready to send
- Designed so reaching out never feels awkward or forced

### 📨 In-App Messaging
- Students can message matched peers directly without exchanging contact info upfront
- Full chat history and unread notifications included

---

## How We Built It

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python + FastAPI |
| LLM | GPT-4o (OpenAI API) |
| Frontend | React + TypeScript + Tailwind CSS |
| Database | PostgreSQL |
| Auth | JWT-based authentication |

### AI Matching Pipeline

Student descriptions are parsed by an LLM into four structured dimensions:

| Dimension | Example |
|-----------|---------|
| `context` | transfer adjustment, academic stress, dating |
| `struggle_type` | social isolation, procedural confusion, anxiety |
| `emotional_signal` | lonely, overwhelmed, frustrated |
| `help_needed` | reassurance, peer experience, practical tips |

These are then scored against peer profiles using a combination of rule-based field matching and LLM semantic reasoning.

**Scoring Algorithm:**

$$S_{\text{final}}(p) = S_{\text{field}}(p) + S_{\text{llm}}(p) + 10 \cdot \frac{|T_{\text{student}} \cap T_p|}{|T_{\text{student}}|}$$

### Two-Stage Ranking

Fast rule-based scoring runs across all candidates first; LLM reranking is applied only to the top candidates — keeping response times low without sacrificing quality.

### Conversation Starter Generation

A dedicated LLM prompt grounds each opening message in the specific peer's past experience and the match reason, making every starter feel genuinely personal.

---

## System Architecture

```
User Input
  ├── Select Tags (multi-select)
  └── Natural language challenge description
        ↓
Stage 1: Tag Filter
  └── Filter candidate peers by overlapping tags
        ↓
Stage 2: LLM Problem Parser
  └── Description → Structured Challenge Profile (JSON)
        ↓
Stage 3: Relevance Scoring
  └── Challenge Profile vs. each candidate's past_challenges
        ↓
Stage 4: Ranking & Output
  └── tag score + LLM relevance score → top peers + explanations
```

---

## Data Schema

### Peer Profile

```json
{
  "id": "peer_001",
  "name": "Jordan",
  "major": "Computer Science",
  "year": "Senior",
  "tags": ["transfer student", "making friends", "joining clubs"],
  "past_challenges": [
    {
      "raw": "I transferred in sophomore year and felt disconnected socially.",
      "parsed": {
        "context": "transfer adjustment",
        "struggle_type": "social isolation",
        "emotional_signal": "lonely",
        "resolution_type": "peer experience"
      }
    }
  ],
  "help_topics": ["transfer adjustment", "campus social life"],
  "comfort_level": "open to messages"
}
```

---

## LLM Prompts

### Prompt 1 — Parse Student Input

```
You are analyzing a university student's challenge description.
Extract the following fields. You MUST choose values ONLY from the provided options.
Return ONLY a JSON object, no explanation.

"context": ["transfer adjustment", "freshman adjustment", "academic stress",
            "course registration", "campus navigation", "social life",
            "dating", "internship search", "research decisions",
            "housing", "international student adjustment", "changing majors"]

"struggle_type": ["social isolation", "procedural confusion", "academic difficulty",
                  "anxiety", "burnout", "lack of information", "difficulty adapting",
                  "relationship confusion", "time management", "financial stress"]

"emotional_signal": ["lonely", "overwhelmed", "frustrated", "uncertain",
                     "anxious", "lost", "stressed", "hopeful", "confused"]

"help_needed": ["reassurance", "step-by-step advice", "peer experience",
                "practical tips", "emotional support", "introductions to people",
                "information about resources"]

Student input: "{user_description}"
```

### Prompt 2 — Relevance Scoring

```
You are comparing a student's current challenge with a peer's past experience.

Student Challenge Profile:
- Context: {student.context}
- Struggle type: {student.struggle_type}
- Emotional signal: {student.emotional_signal}
- Help needed: {student.help_needed}

Peer's Past Experience: "{peer.past_challenges[n].raw}"

Score this match from 0 to 10. Return ONLY:
{ "score": <0-10>, "reason": "<one sentence>" }
```

### Prompt 3 — Conversation Starter

```
A student is reaching out to a peer for the first time.

Student situation: "{user_description}"
Peer background: "{peer.past_challenges[n].raw}"
Match reason: "{reason from Prompt 2}"

Write a warm, natural opening message (2-3 sentences) the student could send.
Do not be overly formal. Make it feel like one student talking to another.
```

---

## Functional Requirements

| ID | Feature | Priority |
|----|---------|----------|
| PP-1 | Tag-based peer filtering | High |
| PP-2 | Challenge description input | High |
| PP-3 | LLM semantic matching | High |
| PP-4 | Peer recommendation ranking | Medium |
| PP-5 | Explanation generation | Medium |
| PP-6 | Conversation starter generation | Medium |

---

## Challenges We Ran Into

**1. LLM Cost vs. Performance Trade-off**
Our initial plan was to use LLM reasoning for every candidate comparison, but this proved too token-heavy and expensive at scale. We designed a two-stage scoring algorithm — fast rule-based field matching for all candidates first, with LLM semantic reasoning applied only to the top finalists.

**2. Structured LLM Output for Downstream Scoring**
For the similarity scoring to work, the LLM needed to return data in a consistent, structured format — not free-form text. We had to carefully design prompt templates with a fixed output schema so the parsed challenge profile could be reliably consumed by the scoring pipeline.

**3. Matching Latency and User Experience**
The multi-step matching pipeline introduced noticeable loading time. Rather than hiding it, we leaned into it — designing a loading screen with rotating micro-messages to set honest expectations and keep users engaged while results load.

**4. Scope Expansion Mid-Build**
Starting with a single matching page, we quickly realized users needed a way to revisit past results — leading us to design and build a full match history system with persistent storage.

---

## Accomplishments We're Proud Of

- ✅ A matching system that understands emotional context and lived experience, not just keyword overlap
- ✅ Conversation starters that students actually want to send
- ✅ A complete end-to-end product built at a hackathon: registration, profiles, matching, messaging, and history

---

## What We Learned

The algorithm is only half the product. How a match is explained, and whether the opening message sounds human, determines whether a student actually reaches out. Getting the tone right mattered just as much as getting the ranking right. Clear explanations, intuitive design, and a friendly interaction flow significantly increase the likelihood that students use the match and reach out.

---

## What's Next for PeerPath

- 🔒 **Anonymous matching** — matched peers can choose to stay anonymous until they feel comfortable sharing
- 🎓 **University email verification** — requiring a `.edu` email (e.g. `umich.edu`) to keep the platform within the student community
- 🏷️ **Custom tags** — letting students search, create, and contribute their own tags beyond the preset list
- 🤖 **AI navigation agent** — an in-app assistant powered by curated campus resources and support data
- 📈 **Smarter ranking over time** — fine-tuning matching weights based on real outcome data and peer activity signals
- 🔄 **User feedback and data expansion** — collecting interaction data to expand the database and continuously refine match quality using machine learning

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/your-org/peerpath.git
cd peerpath

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

Set your environment variables:
```env
OPENAI_API_KEY=your_key_here
DATABASE_URL=postgresql://...
JWT_SECRET=your_secret_here
```

---

## Honor
This product has earned the 3rd place at the **CampusAI x MDC Hackathon 2026** event.
[More details on Devpost.](https://devpost.com/software/titled-5yi7qr?_gl=1*1hf82d8*_gcl_au*MjAzMzg4NTIyMS4xNzY3OTE0Njkz*_ga*MTg5MDQxMjI0LjE3Njc5MTQ2OTM.*_ga_0YHJK3Y10M*czE3NzM2MDg3NzgkbzE1JGcxJHQxNzczNjA4OTU4JGo2MCRsMCRoMA..)
