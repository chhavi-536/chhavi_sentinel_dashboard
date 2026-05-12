const express = require('express');;
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

app.get('/api/data', (req, res) => {
  res.json({ data: 'sample data' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('auth-service running on port', PORT));