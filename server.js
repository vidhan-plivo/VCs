const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'people.json');

app.use(express.json());
app.use(express.static(__dirname));

// Helper: read people from file
function readPeople() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

// Helper: write people to file
function writePeople(people) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(people, null, 2) + '\n');
}

// Helper: generate slug from name
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// GET /api/people — list all
app.get('/api/people', (req, res) => {
  res.json(readPeople());
});

// GET /api/people/:id — get one
app.get('/api/people/:id', (req, res) => {
  const people = readPeople();
  const person = people.find(p => p.id === req.params.id);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  res.json(person);
});

// POST /api/people — create
app.post('/api/people', (req, res) => {
  const { name, role, linkedin, email } = req.body;
  if (!name || !role || !email) {
    return res.status(400).json({ error: 'name, role, and email are required' });
  }

  const people = readPeople();
  const id = slugify(name);

  if (people.find(p => p.id === id)) {
    return res.status(409).json({ error: 'A person with this name already exists' });
  }

  const gradientBg = req.body.gradientBg || '';
  const person = { id, name, role, linkedin: linkedin || '', email, gradientBg };
  people.push(person);
  writePeople(people);
  res.status(201).json(person);
});

// PUT /api/people/:id — update
app.put('/api/people/:id', (req, res) => {
  const people = readPeople();
  const index = people.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Person not found' });

  const { name, role, linkedin, email } = req.body;
  if (name) people[index].name = name;
  if (role) people[index].role = role;
  if (linkedin !== undefined) people[index].linkedin = linkedin;
  if (email) people[index].email = email;
  if (req.body.gradientBg !== undefined) people[index].gradientBg = req.body.gradientBg;

  // Update slug if name changed
  if (name) {
    const newId = slugify(name);
    if (newId !== req.params.id && people.find(p => p.id === newId)) {
      return res.status(409).json({ error: 'A person with this name already exists' });
    }
    people[index].id = newId;
  }

  writePeople(people);
  res.json(people[index]);
});

// DELETE /api/people/:id — delete
app.delete('/api/people/:id', (req, res) => {
  let people = readPeople();
  const index = people.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Person not found' });

  people.splice(index, 1);
  writePeople(people);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
});
