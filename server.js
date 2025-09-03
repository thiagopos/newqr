const express = require('express');
const QRCode = require('qrcode');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

// Middleware to parse JSON and serve static files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to serve the compress page
app.get('/compress', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'compress.html'));
});

// Route to generate QR code
app.post('/generate-qr', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(url);
    res.json({ qrCode: qrCodeDataURL });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Route to compress PDFs
app.post('/compress-pdf', upload.array('pdfs'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No PDF files uploaded' });
  }

  const compressedFiles = [];
  let processed = 0;

  req.files.forEach((file, index) => {
    const inputPath = file.path;
    const outputPath = path.join('uploads', `compressed_${file.originalname}`);
    
    // Ghostscript command for compression
    const gsCommand = `"C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe" -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;
    
    exec(gsCommand, (error, stdout, stderr) => {
      processed++;
      
      if (error) {
        console.error(`Error compressing ${file.originalname}:`, error);
        // Clean up
        fs.unlinkSync(inputPath);
      } else {
        compressedFiles.push({
          originalName: file.originalname,
          compressedName: `compressed_${file.originalname}`,
          downloadUrl: `/download/${encodeURIComponent(`compressed_${file.originalname}`)}`
        });
        // Clean up original
        fs.unlinkSync(inputPath);
      }
      
      // Send response when all files are processed
      if (processed === req.files.length) {
        if (compressedFiles.length === 0) {
          return res.status(500).json({ error: 'Failed to compress any PDFs. Make sure Ghostscript is installed.' });
        }
        res.json({ compressedFiles });
      }
    });
  });
});

// Route to download compressed files
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join('uploads', filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
      } else {
        // Clean up file after download
        fs.unlinkSync(filePath);
      }
    });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
