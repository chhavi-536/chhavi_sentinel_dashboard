const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'data-service' });
});

app.get('/api/data', (req, res) => {
  res.json({ data: 'sample data' });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log('data-service running on port', PORT));