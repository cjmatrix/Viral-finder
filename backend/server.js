const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const clipRoutes = require('./src/routes/clipRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/clips', express.static(path.join(__dirname, 'clips')));

// Routes
app.use('/api', clipRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
