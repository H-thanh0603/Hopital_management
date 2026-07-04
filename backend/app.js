const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Hospital Management System API is running.' });
});

app.use('/api/auth', authRoutes);

app.use('/api', notFoundHandler);
app.use(errorHandler);

module.exports = app;
