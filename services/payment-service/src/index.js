const express = require('express');;
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'payment-service' });
});

app.get('/api/data', (req, res) => {
  res.json({ data: 'sample data' });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log('payment-service running on port', PORT));