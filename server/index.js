import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { fileValidation } from './middleware/fileValidation.js';
import csvParser from 'csv-parser';
import stream from 'stream';
import { processQuestion } from './middleware/nlpProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Use memory storage for multer to store the file buffer in memory
const storage = multer.memoryStorage();

// Middleware to parse JSON request bodies
app.use(express.json());

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    checkFileType(file, cb);
  }
}).fields([
  { name: 'databaseFile', maxCount: 1 }
]);

// Function to check if the uploaded file is a CSV
function checkFileType(file, cb) {
  const filetypes = /csv/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb('Error: Only CSV files are allowed!');
  }
}

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

let csvData = [];
let uploadedFileName = '';

// Route for the home page
app.get('/', (req, res) => res.render('index'));

// Handle file upload and CSV parsing
app.post('/upload', upload, fileValidation, (req, res) => {
  const errors = req.fileValidationErrors;
  if (errors) {
    return res.json({ success: false, message: errors });
  }

  const csvFile = req.files['databaseFile'][0];
  uploadedFileName = csvFile.originalname;
  const results = [];

  // Create a stream from the file buffer
  const bufferStream = new stream.PassThrough();
  bufferStream.end(csvFile.buffer);

  // Parse the CSV data
  bufferStream
    .pipe(csvParser())
    .on('data', (row) => {
      results.push(row);
    })
    .on('end', () => {
      csvData = results;
      res.json({ success: true });
    })
    .on('error', (error) => {
      res.json({ success: false, message: error.message });
    });
});

app.get('/database', (req, res) => {
  let page = parseInt(req.query.page) || 1;
  const rowsPerPage = 15;
  const totalRows = csvData.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);

  if (page < 1) {
    page = 1;
  } else if (page > totalPages) {
    page = totalPages;
  }

  const startRow = (page - 1) * rowsPerPage;
  const endRow = startRow + rowsPerPage;
  const pageData = csvData.slice(startRow, endRow);

  res.render('database', {
    csvData: pageData,
    currentPage: page,
    totalPages: totalPages,
    fileName: uploadedFileName
  });
});

app.get('/chat', (req, res) => {
  res.render('chat');
});

// Handle user questions (for the chat functionality)
app.post('/ask', (req, res) => {
  const question = req.body.question;
  console.log('User question:', question);

  // Process the question with NLP
  const response = processQuestion(question, csvData);

  res.json({ answer: response });
});

app.listen(port, () => console.log(`Server started on port http://localhost:${port}`));
