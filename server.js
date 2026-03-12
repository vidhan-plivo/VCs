const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'people.json');

// GitHub API config (set these env vars on Render)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // e.g. "vidhan-plivo/VCs"
const GITHUB_FILE = 'people.json';

app.use(express.json());
app.use(express.static(__dirname));

// In-memory cache
let peopleCache = null;
let githubSha = null; // needed for GitHub API updates

// --- Storage layer ---

async function fetchFromGitHub() {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
  );
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status}`);
  const data = await res.json();
  githubSha = data.sha;
  return JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
}

async function pushToGitHub(people) {
  const content = Buffer.from(JSON.stringify(people, null, 2) + '\n').toString('base64');
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update people.json', content, sha: githubSha }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub push failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  githubSha = data.content.sha;
}

function useGitHub() {
  return GITHUB_TOKEN && GITHUB_REPO;
}

// Read people — from cache/GitHub or local file
async function readPeople() {
  if (useGitHub()) {
    if (!peopleCache) {
      peopleCache = await fetchFromGitHub();
    }
    return peopleCache;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

// Write people — to GitHub + cache, or local file
async function writePeople(people) {
  if (useGitHub()) {
    await pushToGitHub(people);
    peopleCache = people;
  } else {
    fs.writeFileSync(DATA_FILE, JSON.stringify(people, null, 2) + '\n');
  }
}

// Helper: generate slug from name
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// GET /api/people — list all
app.get('/api/people', async (req, res) => {
  try {
    res.json(await readPeople());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load people' });
  }
});

// GET /api/people/:id — get one
app.get('/api/people/:id', async (req, res) => {
  try {
    const people = await readPeople();
    const person = people.find(p => p.id === req.params.id);
    if (!person) return res.status(404).json({ error: 'Person not found' });
    res.json(person);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load people' });
  }
});

// POST /api/people — create
app.post('/api/people', async (req, res) => {
  try {
    const { name, role, linkedin, email } = req.body;
    if (!name || !role || !email) {
      return res.status(400).json({ error: 'name, role, and email are required' });
    }

    const people = await readPeople();
    const id = slugify(name);

    if (people.find(p => p.id === id)) {
      return res.status(409).json({ error: 'A person with this name already exists' });
    }

    const gradientBg = req.body.gradientBg || '';
    const person = { id, name, role, linkedin: linkedin || '', email, gradientBg };
    people.push(person);
    await writePeople(people);
    res.status(201).json(person);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save' });
  }
});

// PUT /api/people/:id — update
app.put('/api/people/:id', async (req, res) => {
  try {
    const people = await readPeople();
    const index = people.findIndex(p => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Person not found' });

    const { name, role, linkedin, email } = req.body;
    if (name) people[index].name = name;
    if (role) people[index].role = role;
    if (linkedin !== undefined) people[index].linkedin = linkedin;
    if (email) people[index].email = email;
    if (req.body.gradientBg !== undefined) people[index].gradientBg = req.body.gradientBg;

    if (name) {
      const newId = slugify(name);
      if (newId !== req.params.id && people.find(p => p.id === newId)) {
        return res.status(409).json({ error: 'A person with this name already exists' });
      }
      people[index].id = newId;
    }

    await writePeople(people);
    res.json(people[index]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save' });
  }
});

// DELETE /api/people/:id — delete
app.delete('/api/people/:id', async (req, res) => {
  try {
    const people = await readPeople();
    const index = people.findIndex(p => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Person not found' });

    people.splice(index, 1);
    await writePeople(people);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
  console.log(`Storage: ${useGitHub() ? 'GitHub API' : 'local file'}`);
});
